-- Keep the password contract, but never lock every referee out because an
-- anonymous caller supplied wrong passwords. This threshold is diagnostic;
-- origin-based brute-force protection needs a separately trusted gateway.
-- All expected rejections return JSON so their audit insert can commit.
-- Older Admin RPCs locked workspace_state before the data-plane trigger took
-- its advisory lock. Restore and referee RPCs take those locks in the reverse
-- order. Preserve every installed API/overload, adding the same first lock to
-- the existing definitions (including the internal Admin match helper).
do $$
declare v_function record; v_definition text; v_patched text;
begin
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('flbp_admin_push_workspace_state','flbp_admin_push_match_result','flbp_apply_match_result_patch')
  loop
    v_definition:=pg_get_functiondef(v_function.oid);
    if strpos(v_definition,'A09_ADVISORY_BEFORE_WORKSPACE_ROW')>0 then continue; end if;
    v_patched:=regexp_replace(v_definition,E'(\n[Bb][Ee][Gg][Ii][Nn][ \t]*\r?\n)',
      E'\\1  -- A09_ADVISORY_BEFORE_WORKSPACE_ROW\n  perform pg_advisory_xact_lock(hashtext(''flbp_data_plane:'' || nullif(trim(coalesce(p_workspace_id, '''')), '''')));\n');
    if v_patched=v_definition then raise exception 'Cannot safely align workspace lock order for %',v_function.oid::regprocedure; end if;
    execute v_patched;
  end loop;
end;
$$;

create or replace function public.flbp_referee_check_credentials(
  p_workspace_id text, p_tournament_id text, p_password text,
  p_action text, p_auth_version text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_state jsonb;
  v_updated_at timestamptz;
  v_password text;
  v_version text;
  v_reason text;
begin
  select state, updated_at into v_state, v_updated_at
  from public.workspace_state where workspace_id = p_workspace_id;
  v_password := coalesce(v_state #>> '{tournament,refereesPassword}', '');
  v_version := nullif(v_state #>> '{tournament,refereesAuthVersion}', '');
  if v_state is null then v_reason := 'workspace_missing';
  elsif coalesce(v_state #>> '{tournament,id}', '') = ''
    or (v_state #>> '{tournament,id}') is distinct from p_tournament_id then v_reason := 'tournament_mismatch';
  elsif v_password = '' then v_reason := 'no_config';
  elsif v_password <> coalesce(p_password, '') then
    v_reason := case when public.flbp_referee_auth_is_rate_limited(p_workspace_id,p_tournament_id)
      then 'rate_limited' else 'bad_password' end;
  elsif nullif(trim(p_auth_version), '') is not null and v_version is not null
    and trim(p_auth_version) <> v_version then v_reason := 'auth_version_mismatch';
  end if;
  if v_reason is not null then
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,p_action,false,v_reason,null);
    return jsonb_build_object('ok',false,'reason',v_reason);
  end if;
  return jsonb_build_object('ok',true,'auth_version',v_version,'updated_at',v_updated_at,'state',v_state);
end;
$$;
revoke all on function public.flbp_referee_check_credentials(text,text,text,text,text) from public,anon,authenticated;

create or replace function public.flbp_referee_auth_check(p_workspace_id text,p_tournament_id text,p_referees_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.flbp_referee_check_credentials(p_workspace_id,p_tournament_id,p_referees_password,'auth_check');
  if (v_out->>'ok')::boolean then
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'auth_check',true,'ok',v_out->>'auth_version');
  end if;
  return v_out - 'state';
end;
$$;

create or replace function public.flbp_referee_pull_live_state(p_workspace_id text,p_tournament_id text,p_referees_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.flbp_referee_check_credentials(p_workspace_id,p_tournament_id,p_referees_password,'pull_live_state');
  if (v_out->>'ok')::boolean then
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'pull_live_state',true,'ok',v_out->>'auth_version');
  end if;
  return v_out;
end;
$$;

-- Prefer tournamentMatches, then tournament.matches, then legacy rounds, as
-- the existing per-match lookup does. Redundant representations are updated
-- from the same canonical match; payloads can never add workspace properties.
create or replace function public.flbp_referee_collect_matches(p_state jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_candidates jsonb := '[]'; v_round jsonb; v_item jsonb; v_id text; v_seen text[] := '{}'; v_out jsonb := '[]';
begin
  if jsonb_typeof(p_state->'tournamentMatches') = 'array' then v_candidates := v_candidates || (p_state->'tournamentMatches'); end if;
  if jsonb_typeof(p_state#>'{tournament,matches}') = 'array' then v_candidates := v_candidates || (p_state#>'{tournament,matches}'); end if;
  if jsonb_typeof(p_state#>'{tournament,rounds}') = 'array' then
    for v_round in select value from jsonb_array_elements(p_state#>'{tournament,rounds}') loop
      if jsonb_typeof(v_round) = 'array' then v_candidates := v_candidates || v_round; end if;
    end loop;
  end if;
  for v_item in select value from jsonb_array_elements(v_candidates) loop
    v_id := nullif(v_item->>'id','');
    if jsonb_typeof(v_item) <> 'object' or v_id is null then raise exception 'Partita senza identificatore'; end if;
    if not (v_id = any(v_seen)) then
      v_seen := array_append(v_seen,v_id); v_out := v_out || jsonb_build_array(v_item);
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.flbp_referee_merge_match_array(p_array jsonb,p_updates jsonb,p_append boolean default false)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_out jsonb := '[]'; v_item jsonb; v_update jsonb; v_seen text[] := '{}';
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_array,'[]')) loop
    select value into v_update from jsonb_array_elements(p_updates) where value->>'id'=v_item->>'id';
    v_out := v_out || jsonb_build_array(coalesce(v_update,v_item));
    v_seen := array_append(v_seen,v_item->>'id');
  end loop;
  if p_append then
    for v_update in select value from jsonb_array_elements(p_updates) loop
      if not ((v_update->>'id') = any(v_seen)) then v_out := v_out || jsonb_build_array(v_update); end if;
    end loop;
  end if;
  return v_out;
end;
$$;

create or replace function public.flbp_referee_merge_match_state(p_state jsonb,p_updates jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_out jsonb := p_state; v_rounds jsonb := '[]'; v_round jsonb;
begin
  v_out := jsonb_set(v_out,'{tournamentMatches}',public.flbp_referee_merge_match_array(
    public.flbp_referee_collect_matches(p_state),p_updates,true),true);
  if jsonb_typeof(p_state#>'{tournament,matches}') = 'array' then
    v_out := jsonb_set(v_out,'{tournament,matches}',public.flbp_referee_merge_match_array(p_state#>'{tournament,matches}',p_updates,true),true);
  end if;
  if jsonb_typeof(p_state#>'{tournament,rounds}') = 'array' then
    for v_round in select value from jsonb_array_elements(p_state#>'{tournament,rounds}') loop
      v_rounds := v_rounds || jsonb_build_array(case when jsonb_typeof(v_round)='array'
        then public.flbp_referee_merge_match_array(v_round,p_updates,false) else v_round end);
    end loop;
    v_out := jsonb_set(v_out,'{tournament,rounds}',v_rounds,true);
  end if;
  return v_out;
end;
$$;

-- Internal mutation shared by the modern patch and the legacy adapter. Match
-- fields are whitelisted; no caller-supplied public snapshot is ever trusted.
-- Recursive projection is deliberately independent of the older spread-based
-- sanitizer: private extension fields must not leak while repairing a mirror.
create or replace function public.flbp_referee_public_projection(p_value jsonb,p_kind text,p_date text default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_out jsonb; v_fields text[]; v_children jsonb; v_key text; v_child_kind text;
  v_child jsonb; v_array jsonb; v_slot integer; v_birth date; v_reference date; v_age integer;
begin
  if p_kind='round' then
    select coalesce(jsonb_agg(public.flbp_referee_public_projection(value,'match',p_date)),'[]') into v_out
      from jsonb_array_elements(case when jsonb_typeof(p_value)='array' then p_value else '[]'::jsonb end);
    return v_out;
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' then return 'null'::jsonb; end if;
  v_fields:=case p_kind
    when 'state' then array['__schemaVersion']
    when 'team' then array['id','name','player1','player2','player1IsReferee','player2IsReferee','isReferee','createdAt','hidden','isBye',
      'player1U25','player2U25','player1CareerU25','player2CareerU25']
    when 'tournament' then array['id','name','type','startDate','refereesAuthVersion','isManual','includeU25Awards']
    when 'group' then array['id','name','stage']
    when 'config' then array['advancingPerGroup','resultsOnly','refTables']
    when 'finalConfig' then array['enabled','topTeams','activated']
    when 'fanta' then array['enabled','updatedAt']
    when 'stat' then array['teamId','playerName','canestri','soffi']
    when 'audit' then array['id','matchId','source','refereeName','savedAt','scoreA','scoreB']
    when 'match' then array['id','teamAId','teamBId','scoreA','scoreB','played','status','round','code','phase','groupName','roundName',
      'orderIndex','nextMatchId','nextSlot','hidden','isBye','isTieBreak','targetScore','refereeReportFinalId','refereeReportSource',
      'refereeReportAuthorName','refereeReportSavedAt']
    else '{}'::text[] end;
  select coalesce(jsonb_object_agg(key,value),'{}') into v_out from jsonb_each(p_value)
    where key=any(v_fields) and jsonb_typeof(value) in ('string','number','boolean','null');
  v_children:=case p_kind
    when 'state' then '{"teams":"team","tournament":"tournament","tournamentMatches":"match","fantaSettings":"fanta"}'::jsonb
    when 'tournament' then '{"teams":"team","groups":"group","matches":"match","rounds":"round","config":"config"}'::jsonb
    when 'group' then '{"teams":"team"}'::jsonb
    when 'config' then '{"finalRoundRobin":"finalConfig"}'::jsonb
    when 'match' then '{"stats":"stat","refereeReportAudit":"audit"}'::jsonb
    when 'audit' then '{"stats":"stat"}'::jsonb
    else '{}'::jsonb end;
  if p_kind='state' then
    p_date:=p_value#>>'{tournament,startDate}';
    v_out:='{"__schemaVersion":1,"teams":[],"tournament":null,"tournamentMatches":[]}'::jsonb||v_out;
  elsif p_kind='tournament' then p_date:=p_value->>'startDate'; end if;
  for v_key,v_child_kind in select key,value from jsonb_each_text(v_children) loop
    if not(p_value?v_key) then continue; end if;
    v_child:=p_value->v_key;
    if jsonb_typeof(v_child)='array' then
      select coalesce(jsonb_agg(public.flbp_referee_public_projection(value,v_child_kind,p_date)),'[]') into v_array
        from jsonb_array_elements(v_child);
      v_out:=v_out||jsonb_build_object(v_key,v_array);
    else v_out:=v_out||jsonb_build_object(v_key,public.flbp_referee_public_projection(v_child,v_child_kind,p_date)); end if;
  end loop;
  if p_kind='match' and jsonb_typeof(p_value->'teamIds')='array' then
    select coalesce(jsonb_agg(value),'[]') into v_array from jsonb_array_elements(p_value->'teamIds') where jsonb_typeof(value)='string';
    v_out:=v_out||jsonb_build_object('teamIds',v_array);
  end if;
  if p_kind='tournament' and jsonb_typeof(p_value->'refereesRoster')='array' then
    select coalesce(jsonb_agg(value),'[]') into v_array from jsonb_array_elements(p_value->'refereesRoster') where jsonb_typeof(value)='string';
    v_out:=v_out||jsonb_build_object('refereesRoster',v_array);
  end if;
  if p_kind in ('match','audit') and jsonb_typeof(p_value->'scoresByTeam')='object' then
    select coalesce(jsonb_object_agg(key,value),'{}') into v_child from jsonb_each(p_value->'scoresByTeam') where jsonb_typeof(value)='number';
    v_out:=v_out||jsonb_build_object('scoresByTeam',v_child);
  end if;
  if p_kind='team' then
    for v_slot in 1..2 loop
      if nullif(p_value->>('player'||v_slot||'BirthDate'),'') is null then continue; end if;
      begin
        v_birth:=(p_value->>('player'||v_slot||'BirthDate'))::date;
        v_age:=extract(year from current_date)::integer-extract(year from v_birth)::integer;
        v_out:=v_out||jsonb_build_object('player'||v_slot||'CareerU25',v_age between 0 and 25);
        v_reference:=nullif(left(p_date,10),'')::date;
        v_age:=extract(year from age(v_reference,v_birth))::integer;
        v_out:=v_out||jsonb_build_object('player'||v_slot||'U25',coalesce(v_reference>=v_birth and v_age between 0 and 25,false));
      exception when invalid_datetime_format or datetime_field_overflow then null;
      end;
    end loop;
  end if;
  return v_out;
end;
$$;
revoke all on function public.flbp_referee_public_projection(jsonb,text,text) from public,anon,authenticated;

create or replace function public.flbp_referee_apply_match_updates(p_workspace_id text,p_tournament_id text,p_matches jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_state jsonb; v_public jsonb; v_current_matches jsonb; v_public_matches jsonb;
  v_item jsonb; v_current jsonb; v_clean jsonb; v_updates jsonb := '[]'; v_public_updates jsonb;
  v_id text; v_seen text[] := '{}'; v_new_count integer := 0;
  v_final_group jsonb; v_participants text[]; v_team_id text; v_next_ftb integer;
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
      -- The referee UI may create one scheduled final tie-break while saving
      -- the last group result. It cannot create arbitrary tournament matches.
      v_new_count := v_new_count+1;
      select value into v_final_group from jsonb_array_elements(coalesce(v_state#>'{tournament,groups}','[]'))
        where value->>'stage'='final' or coalesce(value->>'name','') ~* '\mfinale?\M' limit 1;
      select coalesce(max(substring(value->>'code' from '^FTB([0-9]+)$')::integer),0)+1 into v_next_ftb
        from jsonb_array_elements(v_current_matches) where value->>'code' ~ '^FTB[0-9]+$';
      if v_new_count>1 or v_final_group is null
        or v_state#>'{tournament,config,finalRoundRobin,enabled}' is distinct from 'true'::jsonb
        or v_state#>'{tournament,config,finalRoundRobin,activated}' is distinct from 'true'::jsonb
        or v_clean->'isTieBreak' is distinct from 'true'::jsonb
        or v_clean->>'phase' is distinct from 'groups'
        or v_clean->>'groupName' is distinct from v_final_group->>'name'
        or v_clean->>'code' is distinct from ('FTB'||v_next_ftb)
        or v_clean->>'status' is distinct from 'scheduled'
        or v_clean->'played' is distinct from 'false'::jsonb
        or v_clean->'scoreA' is distinct from '0'::jsonb or v_clean->'scoreB' is distinct from '0'::jsonb
        or coalesce(v_clean->'hidden','false') <> 'false'::jsonb or coalesce(v_clean->'isBye','false') <> 'false'::jsonb
        or v_clean ? 'refereeReportSavedAt' or v_clean ? 'refereeReportFinalId'
        or exists(select 1 from jsonb_array_elements(public.flbp_referee_merge_match_array(v_current_matches,p_matches,false)) m where m->'isTieBreak'='true'
          and m->>'groupName'=v_final_group->>'name' and m->>'status'<>'finished')
        or exists(select 1 from jsonb_array_elements(public.flbp_referee_merge_match_array(v_current_matches,p_matches,false)) m
          where m->>'phase'='groups' and m->>'groupName'=v_final_group->>'name'
            and coalesce(m->'isTieBreak','false')='false' and m->>'status' is distinct from 'finished')
      then raise exception 'Creazione partita non autorizzata'; end if;
      if jsonb_typeof(v_clean->'teamIds')='array' then
        select array_agg(value) into v_participants from jsonb_array_elements_text(v_clean->'teamIds');
      else v_participants := array[v_clean->>'teamAId',v_clean->>'teamBId']; end if;
      if coalesce(cardinality(v_participants),0)<2
        or cardinality(v_participants) <> (select count(distinct t) from unnest(v_participants) t)
      then raise exception 'Partecipanti spareggio non validi'; end if;
      foreach v_team_id in array v_participants loop
        if not exists(select 1 from jsonb_array_elements(coalesce(v_final_group->'teams','[]')) t
          where t->>'id'=v_team_id and coalesce(t->'hidden','false')='false' and coalesce(t->'isBye','false')='false'
            and upper(v_team_id) not like 'BYE%') then raise exception 'Squadra estranea al girone finale'; end if;
      end loop;
      if not coalesce(v_clean->>'teamAId'=any(v_participants),false)
        or not coalesce(v_clean->>'teamBId'=any(v_participants),false) then raise exception 'Partecipanti spareggio incoerenti'; end if;
      v_clean := v_clean || jsonb_build_object('targetScore',1);
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

create or replace function public.flbp_referee_push_match_result(
  p_workspace_id text,p_tournament_id text,p_match_id text,p_referees_password text,p_matches jsonb,p_auth_version text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_auth jsonb; v_out jsonb; v_reason text; v_matches jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:'||p_workspace_id));
  perform 1 from public.workspace_state where workspace_id=p_workspace_id for update;
  v_auth := public.flbp_referee_check_credentials(p_workspace_id,p_tournament_id,p_referees_password,'push_match_result',p_auth_version);
  if not (v_auth->>'ok')::boolean then
    -- PostgREST can return a non-2xx response without aborting the transaction.
    -- Older browser tabs therefore reject the write too, while the audit survives.
    perform set_config('response.status',case when v_auth->>'reason'='rate_limited' then '429' else '403' end,true);
    return v_auth;
  end if;
  begin
    v_matches := case when jsonb_typeof(p_matches)='object' then jsonb_build_array(p_matches) else p_matches end;
    if jsonb_typeof(v_matches) is distinct from 'array' or not exists(
      select 1 from jsonb_array_elements(v_matches) where value->>'id'=p_match_id
    ) then raise exception 'La patch non contiene la partita principale'; end if;
    v_out := public.flbp_referee_apply_match_updates(p_workspace_id,p_tournament_id,v_matches);
  exception when others then
    v_reason := case when sqlerrm like 'FLBP_DB_CONFLICT:%' then 'conflict' else 'invalid_report' end;
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'push_match_result',false,v_reason,v_auth->>'auth_version');
    perform set_config('response.status',case when v_reason='conflict' or sqlerrm like 'FLBP_LOCAL_PRIMARY:%'
      or sqlerrm like 'FLBP_DATA_PLANE_RECOVERY:%' then '409'
      when sqlstate='P0001' or left(sqlstate,2) in ('22','23') then '400' else '500' end,true);
    return jsonb_build_object('ok',false,'reason',v_reason,'message',sqlerrm);
  end;
  perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'push_match_result',true,'ok',v_auth->>'auth_version');
  perform set_config('response.status','200',true);
  return v_out || jsonb_build_object('auth_version',v_auth->>'auth_version');
end;
$$;

create or replace function public.flbp_referee_push_live_state(
  p_workspace_id text,p_tournament_id text,p_referees_password text,p_state jsonb,p_public_state jsonb,p_base_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_auth jsonb; v_out jsonb; v_matches jsonb; v_current jsonb; v_item jsonb; v_updates jsonb := '[]'; v_reason text;
begin
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:'||p_workspace_id));
  perform 1 from public.workspace_state where workspace_id=p_workspace_id for update;
  v_auth := public.flbp_referee_check_credentials(p_workspace_id,p_tournament_id,p_referees_password,'push_live_state');
  if not (v_auth->>'ok')::boolean then
    perform set_config('response.status',case when v_auth->>'reason'='rate_limited' then '429' else '403' end,true);
    return v_auth;
  end if;
  begin
    if p_base_updated_at is null or (v_auth->>'updated_at')::timestamptz is distinct from p_base_updated_at then
      raise exception 'FLBP_DB_CONFLICT: rileggi il torneo live prima di salvare il referto';
    end if;
    if jsonb_typeof(p_state) is distinct from 'object' or p_state#>>'{tournament,id}' is distinct from p_tournament_id then
      raise exception 'Snapshot del torneo non valido';
    end if;
    v_matches := public.flbp_referee_collect_matches(p_state);
    for v_current in select value from jsonb_array_elements(public.flbp_referee_collect_matches(v_auth->'state')) loop
      if not exists(select 1 from jsonb_array_elements(v_matches) where value->>'id'=v_current->>'id') then
        raise exception 'La rimozione di partite richiede accesso Admin';
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(v_matches) loop
      select value into v_current from jsonb_array_elements(public.flbp_referee_collect_matches(v_auth->'state'))
        where value->>'id'=v_item->>'id';
      if v_current is distinct from v_item then v_updates := v_updates || jsonb_build_array(v_item); end if;
    end loop;
    v_out := public.flbp_referee_apply_match_updates(p_workspace_id,p_tournament_id,v_updates);
  exception when others then
    v_reason := case when sqlerrm like 'FLBP_DB_CONFLICT:%' then 'conflict' else 'invalid_report' end;
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'push_live_state',false,v_reason,v_auth->>'auth_version');
    perform set_config('response.status',case when v_reason='conflict' or sqlerrm like 'FLBP_LOCAL_PRIMARY:%'
      or sqlerrm like 'FLBP_DATA_PLANE_RECOVERY:%' then '409'
      when sqlstate='P0001' or left(sqlstate,2) in ('22','23') then '400' else '500' end,true);
    return jsonb_build_object('ok',false,'reason',v_reason,'message',sqlerrm);
  end;
  perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'push_live_state',true,'ok',v_auth->>'auth_version');
  perform set_config('response.status','200',true);
  return v_out || jsonb_build_object('auth_version',v_auth->>'auth_version');
end;
$$;

revoke all on function public.flbp_referee_collect_matches(jsonb) from public,anon,authenticated;
revoke all on function public.flbp_referee_merge_match_array(jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.flbp_referee_merge_match_state(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.flbp_referee_apply_match_updates(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.flbp_referee_auth_check(text,text,text) from public;
revoke all on function public.flbp_referee_pull_live_state(text,text,text) from public;
revoke all on function public.flbp_referee_push_live_state(text,text,text,jsonb,jsonb,timestamptz) from public;
revoke all on function public.flbp_referee_push_match_result(text,text,text,text,jsonb,text) from public;
grant execute on function public.flbp_referee_auth_check(text,text,text) to anon,authenticated,service_role;
grant execute on function public.flbp_referee_pull_live_state(text,text,text) to anon,authenticated,service_role;
grant execute on function public.flbp_referee_push_live_state(text,text,text,jsonb,jsonb,timestamptz) to anon,authenticated,service_role;
grant execute on function public.flbp_referee_push_match_result(text,text,text,text,jsonb,text) to anon,authenticated,service_role;
