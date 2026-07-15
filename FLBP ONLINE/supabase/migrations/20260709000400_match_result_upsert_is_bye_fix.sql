-- FLBP Manager Suite - fix NOT NULL su is_bye nella RPC per-match.
--
-- Bug: in flbp_match_result_upsert_rows il flag v_is_bye era calcolato come
--   ... or v_team_a_id = 'BYE' or v_team_b_id = 'BYE'
-- Quando un match a valle ha un solo lato deciso, teamBId (o teamAId) e' null;
-- in SQL `null = 'BYE'` vale NULL e `false OR NULL = NULL`, quindi v_is_bye
-- diventava NULL e l'insert violava il NOT NULL di is_bye. Effetto: ogni
-- referto che faceva avanzare un vincitore in una semifinale/finale ancora
-- incompleta faceva fallire la RPC per-match, costringendo i client al
-- fallback snapshot pesante. Fix: coalesce dei team id nel confronto BYE.
--
-- Ridefinizione integrale della funzione (identica all'originale salvo le tre
-- righe del calcolo di v_is_bye).

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
  -- coalesce dei team id: senza di esso, un lato null rendeva NULL l'intera
  -- espressione (false OR NULL = NULL) e violava il NOT NULL di is_bye.
  v_is_bye := lower(coalesce(p_match ->> 'isBye', 'false')) in ('true', 't', '1')
    or coalesce(v_team_a_id, '') = 'BYE'
    or coalesce(v_team_b_id, '') = 'BYE';
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
