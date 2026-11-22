-- Tie-breaks created by a report save.
--
-- When the last result of a group, or of the final round robin, leaves two or
-- more teams level, the app creates the tie-break match in the same save:
-- <letter>TB<n> for a group, FTB<n> for the final group, between two teams
-- (teamAId/teamBId) or more (teamIds with scoresByTeam). The report patch RPCs
-- only updated existing matches: Admin saves failed with "Match ... non trovato
-- nello snapshot live" and referee saves with "Creazione partita non
-- autorizzata" (only a two-team final FTB was accepted).
--
-- One shared rule now decides which new match a report save may create:
-- - an empty, scheduled tie-break (isTieBreak, phase groups, scores 0, no report);
-- - in an existing group, the final group only while the final round robin runs;
-- - between two or more distinct visible teams of that group;
-- - once every other match of the group is finished, counting this patch, and no
--   other tie-break of the group is left to play;
-- - with the next code of its prefix, as numbered by the app.
-- Callers accept at most one new tie-break per group per save. Every other
-- unknown match is still rejected.

create or replace function public.flbp_report_validate_new_tiebreak(
  p_state jsonb,
  p_patch jsonb,
  p_match jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_matches jsonb;
  v_merged jsonb;
  v_patch jsonb := case when jsonb_typeof(p_patch) = 'array' then p_patch else '[]'::jsonb end;
  v_id text := nullif(trim(coalesce(p_match ->> 'id', '')), '');
  v_group_name text := nullif(p_match ->> 'groupName', '');
  v_group jsonb;
  v_participants text[];
  v_team_id text;
  v_code text := coalesce(p_match ->> 'code', '');
  v_prefix text;
  v_expected bigint;
  v_clean jsonb;
begin
  if jsonb_typeof(p_match) is distinct from 'object'
    or jsonb_typeof(p_match -> 'id') is distinct from 'string'
    or v_id is null or length(v_id) > 200
  then
    raise exception 'Creazione partita non autorizzata: identificatore non valido';
  end if;
  v_matches := public.flbp_referee_collect_matches(p_state);
  if exists (select 1 from jsonb_array_elements(v_matches) as m where m ->> 'id' = v_id) then
    raise exception 'Creazione partita non autorizzata: partita già presente';
  end if;

  -- Only an empty, scheduled tie-break.
  if p_match -> 'isTieBreak' is distinct from 'true'::jsonb
    or p_match ->> 'phase' is distinct from 'groups'
    or p_match ->> 'status' is distinct from 'scheduled'
    or coalesce(p_match -> 'played', 'false'::jsonb) <> 'false'::jsonb
    or coalesce(p_match -> 'scoreA', '0'::jsonb) <> '0'::jsonb
    or coalesce(p_match -> 'scoreB', '0'::jsonb) <> '0'::jsonb
    or coalesce(p_match -> 'targetScore', '1'::jsonb) <> '1'::jsonb
    or coalesce(p_match -> 'hidden', 'false'::jsonb) <> 'false'::jsonb
    or coalesce(p_match -> 'isBye', 'false'::jsonb) <> 'false'::jsonb
    or p_match ? 'refereeReportSavedAt' or p_match ? 'refereeReportFinalId' or p_match ? 'refereeReportAudit'
    or (p_match ? 'stats' and (case when jsonb_typeof(p_match -> 'stats') = 'array'
      then jsonb_array_length(p_match -> 'stats') else 1 end) > 0)
  then
    raise exception 'Creazione partita non autorizzata: lo spareggio deve essere da giocare';
  end if;

  -- An existing group; the final group only while the final round robin runs.
  select g.value into v_group
  from jsonb_array_elements(case when jsonb_typeof(p_state #> '{tournament,groups}') = 'array'
    then p_state #> '{tournament,groups}' else '[]'::jsonb end) as g(value)
  where g.value ->> 'name' = v_group_name
  limit 1;
  if v_group_name is null or v_group is null then
    raise exception 'Creazione partita non autorizzata: girone inesistente';
  end if;
  if (v_group ->> 'stage' = 'final' or coalesce(v_group ->> 'name', '') ~* '\mfinale?\M')
    and (p_state #> '{tournament,config,finalRoundRobin,enabled}' is distinct from 'true'::jsonb
      or p_state #> '{tournament,config,finalRoundRobin,activated}' is distinct from 'true'::jsonb)
  then
    raise exception 'Creazione partita non autorizzata: girone finale non attivo';
  end if;

  -- Two or more distinct, visible teams of that group.
  if jsonb_typeof(p_match -> 'teamIds') = 'array' then
    if exists (select 1 from jsonb_array_elements(p_match -> 'teamIds') as t where jsonb_typeof(t) <> 'string') then
      raise exception 'Creazione partita non autorizzata: partecipanti non validi';
    end if;
    select array_agg(t.value) into v_participants
    from jsonb_array_elements_text(p_match -> 'teamIds') as t(value);
    -- The final-group FTB keeps legacy 1v1 fields: they must name participants.
    if (nullif(p_match ->> 'teamAId', '') is not null and not ((p_match ->> 'teamAId') = any(v_participants)))
      or (nullif(p_match ->> 'teamBId', '') is not null and not ((p_match ->> 'teamBId') = any(v_participants)))
    then
      raise exception 'Creazione partita non autorizzata: partecipanti incoerenti';
    end if;
  else
    if jsonb_typeof(p_match -> 'teamAId') is distinct from 'string'
      or jsonb_typeof(p_match -> 'teamBId') is distinct from 'string'
    then
      raise exception 'Creazione partita non autorizzata: partecipanti non validi';
    end if;
    v_participants := array[p_match ->> 'teamAId', p_match ->> 'teamBId'];
  end if;
  if coalesce(cardinality(v_participants), 0) < 2
    or exists (select 1 from unnest(v_participants) as p(id) where nullif(p.id, '') is null)
    or cardinality(v_participants) <> (select count(distinct p.id) from unnest(v_participants) as p(id))
  then
    raise exception 'Creazione partita non autorizzata: partecipanti non validi';
  end if;
  foreach v_team_id in array v_participants loop
    if upper(v_team_id) like 'BYE%' or upper(v_team_id) like 'TBD%' or not exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(v_group -> 'teams') = 'array'
        then v_group -> 'teams' else '[]'::jsonb end) as t(value)
      where t.value ->> 'id' = v_team_id
        and coalesce(t.value -> 'hidden', 'false'::jsonb) = 'false'::jsonb
        and coalesce(t.value -> 'isBye', 'false'::jsonb) = 'false'::jsonb
    ) then
      raise exception 'Creazione partita non autorizzata: squadra estranea al girone';
    end if;
  end loop;
  if p_match ? 'scoresByTeam' then
    if jsonb_typeof(p_match -> 'scoresByTeam') is distinct from 'object' then
      raise exception 'Creazione partita non autorizzata: punteggi dello spareggio non validi';
    end if;
    if exists (
      select 1 from jsonb_each(p_match -> 'scoresByTeam') as s(key, value)
      where not (s.key = any(v_participants)) or s.value <> '0'::jsonb
    ) then
      raise exception 'Creazione partita non autorizzata: punteggi dello spareggio non validi';
    end if;
  end if;

  -- The next code of its prefix, numbered over the whole tournament as the app
  -- does: the group letter is the last character of a renamed group's name
  -- ("Girone Nord" gives dTB1, "Girone 1" gives 1TB1), so case is kept.
  if v_code !~ '^.{1,3}TB[1-9][0-9]{0,3}$' then
    raise exception 'Creazione partita non autorizzata: codice spareggio non valido';
  end if;
  v_prefix := substring(v_code from '^(.{1,3}TB)[0-9]+$');
  select coalesce(max(substring(m ->> 'code' from length(v_prefix) + 1)::bigint), 0) + 1
  into v_expected
  from jsonb_array_elements(v_matches) as m
  where left(coalesce(m ->> 'code', ''), length(v_prefix)) = v_prefix
    and substring(coalesce(m ->> 'code', '') from length(v_prefix) + 1) ~ '^[0-9]{1,9}$';
  if substring(v_code from '([0-9]+)$')::bigint <> v_expected then
    raise exception 'Creazione partita non autorizzata: codice spareggio non coerente';
  end if;

  -- The group is complete, counting results saved by this patch, and has no
  -- other tie-break left to play.
  v_merged := public.flbp_referee_merge_match_array(v_matches, v_patch, false);
  if not exists (
    select 1 from jsonb_array_elements(v_merged) as m
    where m ->> 'phase' = 'groups' and m ->> 'groupName' = v_group_name
      and coalesce(m ->> 'isTieBreak', 'false') <> 'true'
  ) or exists (
    select 1 from jsonb_array_elements(v_merged) as m
    where m ->> 'phase' = 'groups' and m ->> 'groupName' = v_group_name
      and coalesce(m ->> 'isTieBreak', 'false') <> 'true'
      and coalesce(m ->> 'hidden', 'false') <> 'true'
      and coalesce(m ->> 'isBye', 'false') <> 'true'
      and m ->> 'status' is distinct from 'finished'
  ) then
    raise exception 'Creazione partita non autorizzata: il girone non è ancora concluso';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_merged) as m
    where m ->> 'phase' = 'groups' and m ->> 'groupName' = v_group_name
      and coalesce(m ->> 'isTieBreak', 'false') = 'true'
      and m ->> 'status' is distinct from 'finished'
  ) then
    raise exception 'Creazione partita non autorizzata: c''è già uno spareggio da giocare in questo girone';
  end if;

  select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_match) as f(key, value)
  where f.key = any(array['teamAId','teamBId','teamIds','scoresByTeam','scoreA','scoreB','played','status',
    'phase','groupName','orderIndex','isTieBreak']);
  return v_clean || jsonb_build_object('id', v_id, 'code', v_code, 'targetScore', 1);
end;
$$;

create or replace function public.flbp_report_append_new_matches(
  p_state jsonb,
  p_new jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out jsonb := coalesce(p_state, '{}'::jsonb);
begin
  if jsonb_typeof(p_new) is distinct from 'array' then
    return v_out;
  end if;
  if jsonb_array_length(p_new) = 0 then
    return v_out;
  end if;
  if jsonb_typeof(v_out -> 'tournamentMatches') = 'array'
    or jsonb_typeof(v_out #> '{tournament,matches}') is distinct from 'array'
  then
    v_out := jsonb_set(v_out, '{tournamentMatches}', public.flbp_referee_merge_match_array(
      case when jsonb_typeof(v_out -> 'tournamentMatches') = 'array' then v_out -> 'tournamentMatches' else '[]'::jsonb end,
      p_new, true), true);
  end if;
  if jsonb_typeof(v_out #> '{tournament,matches}') = 'array' then
    v_out := jsonb_set(v_out, '{tournament,matches}', public.flbp_referee_merge_match_array(
      v_out #> '{tournament,matches}', p_new, true), true);
  end if;
  return v_out;
end;
$$;

revoke all on function public.flbp_report_validate_new_tiebreak(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.flbp_report_append_new_matches(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.flbp_referee_apply_match_updates(p_workspace_id text,p_tournament_id text,p_matches jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_state jsonb; v_public jsonb; v_current_matches jsonb; v_public_matches jsonb;
  v_item jsonb; v_current jsonb; v_clean jsonb; v_updates jsonb := '[]'; v_public_updates jsonb;
  v_id text; v_seen text[] := '{}'; v_new_groups text[] := '{}';
  v_saved_at timestamptz; v_incoming_at timestamptz; v_updated_at timestamptz;
  v_repair_public boolean := false;
  v_normalized_state jsonb; v_normalized_matches jsonb; v_normalized_teams jsonb; v_full_sync boolean := false;
  v_allowed text[] := array['id','teamAId','teamBId','teamIds','scoresByTeam','scoreA','scoreB','played','status','stats',
    'round','code','phase','groupName','roundName','orderIndex','nextMatchId','nextSlot','hidden','isBye','isTieBreak','targetScore',
    'refereeReportAudit','refereeReportFinalId','refereeReportSource','refereeReportAuthorName','refereeReportSavedAt'];
begin
  if jsonb_typeof(p_matches) is distinct from 'array' then raise exception 'Patch partite non valida'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:'||p_workspace_id));
  select state,updated_at into v_state,v_updated_at from public.workspace_state where workspace_id=p_workspace_id for update;
  select state into v_public from public.public_workspace_state where workspace_id=p_workspace_id for update;
  if (v_state#>>'{tournament,id}') is distinct from p_tournament_id then raise exception 'Torneo live non corrispondente'; end if;
  v_current_matches := public.flbp_referee_collect_matches(v_state);
  v_repair_public:=v_public is null or (v_public#>>'{tournament,id}') is distinct from p_tournament_id;
  if not v_repair_public then
    v_repair_public:=exists(select 1 from jsonb_array_elements(v_current_matches) m
      where not exists(select 1 from jsonb_array_elements(public.flbp_referee_collect_matches(v_public)) p where p->>'id'=m->>'id'));
  end if;
  if v_repair_public then
    v_public:=(coalesce(v_public,'{"logo":"","tournamentHistory":[],"hallOfFame":[],"integrationsScorers":[]}'::jsonb)
      -'teams'-'tournament'-'tournamentMatches'-'fantaSettings')||public.flbp_referee_public_projection(v_state,'state');
  end if;
  v_public_matches := public.flbp_referee_collect_matches(v_public);
  for v_item in select value from jsonb_array_elements(p_matches) loop
    v_id := nullif(trim(v_item->>'id'),'');
    if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item->'id') is distinct from 'string'
      or v_id is null or v_id is distinct from v_item->>'id' or length(v_id)>200 or v_id=any(v_seen) then
      raise exception 'Identificatore partita mancante o duplicato';
    end if;
    v_seen := array_append(v_seen,v_id);
    select value into v_current from jsonb_array_elements(v_current_matches) where value->>'id'=v_id;
    select coalesce(jsonb_object_agg(key,value),'{}') into v_clean from jsonb_each(v_item) where key=any(v_allowed);
    if v_current is null then
      -- A report save may create the tie-break it makes necessary (a group TB
      -- or the final-group FTB, between two or more teams). No other match.
      v_clean := public.flbp_report_validate_new_tiebreak(v_state,p_matches,v_clean);
      if (v_clean->>'groupName') = any(v_new_groups) then
        raise exception 'Creazione partita non autorizzata: un solo spareggio nuovo per girone';
      end if;
      v_new_groups := array_append(v_new_groups,v_clean->>'groupName');
    else
      if not exists(select 1 from jsonb_array_elements(v_public_matches) where value->>'id'=v_id) then
        raise exception 'FLBP_MATCH_RESULT_PUBLIC_SNAPSHOT_STALE: partita pubblica non allineata';
      end if;
      v_saved_at := nullif(v_current->>'refereeReportSavedAt','')::timestamptz;
      v_incoming_at := nullif(v_clean->>'refereeReportSavedAt','')::timestamptz;
      if v_saved_at is not null and (v_incoming_at is null or v_saved_at>v_incoming_at) then
        raise exception 'FLBP_DB_CONFLICT: il DB contiene un referto piu recente per questa partita';
      end if;
      v_clean := v_current || v_clean;
    end if;
    if v_clean is distinct from v_current then v_updates := v_updates || jsonb_build_array(v_clean); end if;
  end loop;
  if jsonb_array_length(v_updates)>0 or v_repair_public then
    if jsonb_array_length(v_updates)>0 then
      v_state := public.flbp_referee_merge_match_state(v_state,v_updates);
      select jsonb_agg(public.flbp_referee_public_projection(m,'match'))
      into v_public_updates from jsonb_array_elements(v_updates) m;
      v_public := public.flbp_referee_merge_match_state(v_public,v_public_updates);
      v_updated_at := clock_timestamp();
    end if;
    -- Legacy databases lack normalized patch/live helpers. Their snapshots
    -- still receive the same scoped write without requiring a schema rebuild.
    if to_regprocedure('public.flbp_match_result_upsert_rows(text,text,jsonb,jsonb,timestamp with time zone)') is not null then
      v_normalized_matches:=case when v_repair_public then public.flbp_referee_collect_matches(v_state) else v_updates end;
      if v_repair_public and to_regprocedure('public.flbp_local_sync_live_normalized_internal(text,jsonb)') is not null then
        v_normalized_teams:=case when jsonb_typeof(v_state#>'{tournament,teams}')='array'
          then v_state#>'{tournament,teams}' else coalesce(v_state->'teams','[]') end;
        -- Match the normalized table's NOT NULL timestamp default when an old
        -- snapshot has no createdAt; do not alter the authoritative snapshot.
        select coalesce(jsonb_agg(t||jsonb_build_object('createdAt',case
          when coalesce(t->>'createdAt','') ~ '^\d+$' then (t->>'createdAt')::bigint
          else floor(extract(epoch from v_updated_at)*1000)::bigint end)),'[]')
          into v_normalized_teams from jsonb_array_elements(v_normalized_teams) t;
        v_normalized_state:=jsonb_set(jsonb_set(v_state,'{tournament,teams}',v_normalized_teams),'{tournamentMatches}',v_normalized_matches);
        -- Rebuild every normalized public row of this live tournament. The
        -- existing cascade removes stale teams/groups/matches/stats too.
        delete from public.public_tournaments where workspace_id=p_workspace_id and id=p_tournament_id;
        perform public.flbp_local_sync_live_normalized_internal(p_workspace_id,v_normalized_state);
        v_full_sync:=true;
      end if;
      for v_item in select value from jsonb_array_elements(v_normalized_matches) loop
        if not v_full_sync then
          perform public.flbp_match_result_upsert_rows(p_workspace_id,p_tournament_id,v_state,v_item,v_updated_at);
        end if;
        update public.public_tournament_matches set referee_report_audit=
          public.flbp_referee_public_projection(v_item,'match')->'refereeReportAudit'
          where workspace_id=p_workspace_id and tournament_id=p_tournament_id and id=v_item->>'id';
      end loop;
      update public.public_tournaments set config=coalesce(nullif(public.flbp_referee_public_projection(v_state#>'{tournament,config}','config'),'null'::jsonb),'{}'::jsonb)
        where workspace_id=p_workspace_id and id=p_tournament_id;
    end if;
    if jsonb_array_length(v_updates)>0 then
      update public.workspace_state set state=v_state,updated_at=v_updated_at where workspace_id=p_workspace_id;
    end if;
    insert into public.public_workspace_state(workspace_id,state,updated_at) values(p_workspace_id,v_public,v_updated_at)
      on conflict(workspace_id) do update set state=excluded.state,updated_at=excluded.updated_at;
    if to_regprocedure('public.flbp_upsert_public_workspace_live(text,jsonb,timestamp with time zone)') is not null then
      perform public.flbp_upsert_public_workspace_live(p_workspace_id,v_public,v_updated_at);
    end if;
  end if;
  return jsonb_build_object('ok',true,'updated_at',v_updated_at,'matches_count',jsonb_array_length(v_updates));
end;
$$;
