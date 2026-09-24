-- Application restore is a single database transaction. Never fall back to
-- independent REST DELETE/INSERT calls when this migration is unavailable.
create table if not exists public.database_restore_checkpoints (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  operation_id text not null,
  backup_hash text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  previous_backup jsonb not null,
  result jsonb,
  primary key (workspace_id, operation_id)
);
alter table public.database_restore_checkpoints enable row level security;
revoke all on public.database_restore_checkpoints from public, anon, authenticated;

create or replace function public.flbp_database_backup_table_order()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'app_settings', 'workspace_state', 'public_workspace_state',
    'player_aliases', 'integrations_scorers', 'hall_of_fame_entries',
    'public_hall_of_fame_entries', 'public_career_leaderboard',
    'public_site_views_daily', 'app_supabase_usage_daily',
    'sim_pool_team_names', 'sim_pool_people',
    'player_app_profiles', 'player_app_devices', 'player_app_calls',
    'player_account_merge_requests', 'referee_auth_audit',
    'tournaments', 'tournament_teams', 'tournament_groups',
    'tournament_group_teams', 'tournament_matches', 'tournament_match_stats',
    'public_tournaments', 'public_tournament_teams', 'public_tournament_groups',
    'public_tournament_group_teams', 'public_tournament_matches', 'public_tournament_match_stats',
    'fanta_config', 'fanta_teams', 'fanta_rosters', 'fanta_roster_change_notices',
    'fanta_archived_editions', 'fanta_archived_standings', 'fanta_archived_players',
    'fanta_archived_rosters'
  ]::text[];
$$;
revoke all on function public.flbp_database_backup_table_order() from public, anon, authenticated;

-- Internal collector: callers lock the tables before taking the snapshot.
create or replace function public.flbp_collect_database_backup(p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_recovery jsonb := '{}'::jsonb;
begin
  for v_table in select unnest(public.flbp_database_backup_table_order()) loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    if v_table = 'fanta_rosters' then
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
      from public.fanta_rosters r join public.fanta_teams t on t.id = r.team_id
      where t.workspace_id = p_workspace_id;
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
    end if;
    v_tables := v_tables || jsonb_build_object(v_table, jsonb_build_object('rows', v_rows, 'rowCount', jsonb_array_length(v_rows)));
  end loop;
  -- Recovery evidence is exported, but leases/epochs are never resurrected
  -- from a file and the existing append-only history is never deleted.
  for v_table in select unnest(array['workspace_state_versions', 'flbp_local_operation_log', 'flbp_data_plane', 'admin_write_lease', 'public_workspace_live']) loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where workspace_id = $1', v_table)
      into v_rows using p_workspace_id;
    v_recovery := v_recovery || jsonb_build_object(v_table, jsonb_build_object('rows', v_rows, 'rowCount', jsonb_array_length(v_rows)));
  end loop;
  return jsonb_build_object(
    'exportType', 'flbp_application_database_backup', 'schemaVersion', 1,
    'workspaceId', p_workspace_id, 'exportedAt', clock_timestamp(),
    'tables', v_tables, 'recovery', v_recovery,
    'warnings', jsonb_build_array('Account Auth e membership admin non vengono ripristinati. Journal e leadership sono conservati; il restore crea una nuova versione e ricostruisce il mirror live.')
  );
end;
$$;
revoke all on function public.flbp_collect_database_backup(text) from public, anon, authenticated;

create or replace function public.flbp_export_application_database(p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_table text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if not exists(select 1 from public.workspaces where id = p_workspace_id) then raise exception 'Workspace inesistente'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  for v_table in select unnest(public.flbp_database_backup_table_order()) loop
    if to_regclass('public.' || v_table) is not null then
      execute format('lock table public.%I in share mode', v_table);
    end if;
  end loop;
  return public.flbp_collect_database_backup(p_workspace_id);
end;
$$;
revoke all on function public.flbp_export_application_database(text) from public, anon, authenticated;
grant execute on function public.flbp_export_application_database(text) to service_role;

create or replace function public.flbp_restore_application_database(
  p_workspace_id text,
  p_backup jsonb,
  p_actor_id uuid,
  p_operation_id text,
  p_lease_holder text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order text[] := public.flbp_database_backup_table_order();
  v_table text;
  v_row jsonb;
  v_rows jsonb;
  v_current record;
  v_plane record;
  v_old_result jsonb;
  v_old_hash text;
  v_state jsonb;
  v_public_state jsonb;
  v_next_version bigint;
  v_epoch bigint;
  v_count bigint;
  v_index integer;
  v_columns text;
  v_updates text;
  v_serial record;
  v_sequence_last_value bigint;
  v_sequence_is_called boolean;
  v_sequence_increment bigint;
  v_sequence_boundary bigint;
  v_sequence_next bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if p_actor_id is null or not exists(select 1 from public.admin_users where user_id = p_actor_id) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if nullif(trim(p_operation_id), '') is null or length(p_operation_id) > 160 then raise exception 'Identificatore ripristino non valido'; end if;
  if p_backup->>'exportType' is distinct from 'flbp_application_database_backup'
    or p_backup->>'schemaVersion' is distinct from '1'
    or p_backup->>'workspaceId' is distinct from p_workspace_id
    or jsonb_typeof(p_backup->'tables') is distinct from 'object'
  then raise exception 'File backup o workspace non valido'; end if;
  -- Old schemas cannot safely restore the modern data plane. Fail BEFORE writes.
  if to_regclass('public.flbp_data_plane') is null
    or to_regclass('public.workspace_state_versions') is null
    or to_regprocedure('public.flbp_upsert_public_workspace_live(text,jsonb,timestamp with time zone)') is null
  then raise exception 'Aggiornare lo schema ONLINE: ripristino transazionale non disponibile'; end if;

  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  perform pg_advisory_xact_lock(hashtext('flbp_admin_write_lease:' || p_workspace_id));
  select backup_hash, result into v_old_hash, v_old_result from public.database_restore_checkpoints
    where workspace_id = p_workspace_id and operation_id = p_operation_id;
  if found then
    if v_old_hash <> md5(p_backup::text) then raise exception 'Identificatore ripristino già usato con un file diverso'; end if;
    return v_old_result;
  end if;
  select * into v_plane from public.flbp_data_plane where workspace_id = p_workspace_id for update;
  if found and v_plane.mode <> 'cloud' then
    raise exception 'Ripristino sospeso: completare il rientro dal server locale al cloud prima di riprovare';
  end if;
  v_epoch := coalesce(v_plane.epoch, 0);
  perform public.flbp_admin_assert_write_lease(p_workspace_id, p_lease_holder);
  if not exists(select 1 from public.workspaces where id = p_workspace_id) then raise exception 'Workspace inesistente'; end if;

  -- Lock the whole write set in a stable order. Reads remain available. All
  -- validations/checkpoint/delete/insert/trigger effects share this transaction.
  foreach v_table in array v_order loop
    if to_regclass('public.' || v_table) is not null then
      execute format('lock table public.%I in share row exclusive mode', v_table);
    end if;
  end loop;

  foreach v_table in array v_order loop
    if to_regclass('public.' || v_table) is null then
      if p_backup->'tables' ? v_table then raise exception 'Tabella del backup assente nello schema: %', v_table; end if;
      continue;
    end if;
    v_rows := p_backup->'tables'->v_table->'rows';
    if jsonb_typeof(v_rows) is distinct from 'array' then raise exception 'Tabella mancante o righe non valide: %', v_table; end if;
    if p_backup->'tables'->v_table->>'rowCount' is distinct from jsonb_array_length(v_rows)::text then
      raise exception 'Conteggio righe non coerente: %', v_table;
    end if;
    for v_row in select value from jsonb_array_elements(v_rows) loop
      if jsonb_typeof(v_row) <> 'object' then raise exception 'Riga non valida: %', v_table; end if;
      if v_table = 'fanta_rosters' then
        if not exists(select 1 from jsonb_array_elements(p_backup->'tables'->'fanta_teams'->'rows') t where t->>'id' = v_row->>'team_id' and t->>'workspace_id' = p_workspace_id) then
          raise exception 'Rosa Fanta non appartenente al workspace del backup';
        end if;
      elsif v_row->>'workspace_id' is distinct from p_workspace_id then
        raise exception 'Riga appartenente a un altro workspace: %', v_table;
      end if;
      if exists(select 1 from jsonb_object_keys(v_row) k where not exists(
        select 1 from pg_attribute a where a.attrelid = to_regclass('public.' || v_table) and a.attname = k and a.attnum > 0 and not a.attisdropped
      )) then raise exception 'Colonna sconosciuta nel backup: %', v_table; end if;
    end loop;
  end loop;
  -- Unknown tables never gain arbitrary SQL access. Preserve the old export's
  -- workspaces/admin_users as informational data, never as authorization writes.
  for v_table in select jsonb_object_keys(p_backup->'tables') loop
    if not v_table = any(v_order) then
      if v_table not in ('workspaces', 'admin_users') then raise exception 'Tabella non prevista nel backup: %', v_table; end if;
      v_warnings := v_warnings || jsonb_build_array('Tabella di accesso preservata senza modifiche: ' || v_table);
    end if;
  end loop;
  if jsonb_array_length(p_backup->'tables'->'workspace_state'->'rows') <> 1
    or jsonb_array_length(p_backup->'tables'->'public_workspace_state'->'rows') <> 1
  then raise exception 'Sono richiesti uno snapshot privato e uno pubblico del workspace'; end if;
  v_state := p_backup->'tables'->'workspace_state'->'rows'->0->'state';
  v_public_state := p_backup->'tables'->'public_workspace_state'->'rows'->0->'state';
  if jsonb_typeof(v_state) is distinct from 'object' or jsonb_typeof(v_public_state) is distinct from 'object' then raise exception 'Snapshot non valido'; end if;

  insert into public.database_restore_checkpoints(workspace_id, operation_id, backup_hash, actor_id, previous_backup)
    values(p_workspace_id, p_operation_id, md5(p_backup::text), p_actor_id, public.flbp_collect_database_backup(p_workspace_id));

  for v_index in reverse array_length(v_order, 1)..1 loop
    v_table := v_order[v_index];
    if v_table in ('workspace_state', 'public_workspace_state') or to_regclass('public.' || v_table) is null then continue; end if;
    if v_table = 'fanta_rosters' then
      delete from public.fanta_rosters r using public.fanta_teams t where t.id = r.team_id and t.workspace_id = p_workspace_id;
    else
      execute format('delete from public.%I where workspace_id = $1', v_table) using p_workspace_id;
    end if;
    get diagnostics v_count = row_count;
    v_deleted := v_deleted || jsonb_build_object(v_table, v_count);
  end loop;
  foreach v_table in array v_order loop
    if v_table in ('workspace_state', 'public_workspace_state') or to_regclass('public.' || v_table) is null then continue; end if;
    v_rows := p_backup->'tables'->v_table->'rows';
    -- Generated columns are reconstructed by PostgreSQL, never copied from JSON.
    select string_agg(format('%I', attname), ', ' order by attnum) into v_columns from pg_attribute
      where attrelid = to_regclass('public.' || v_table) and attnum > 0 and not attisdropped and attgenerated = '';
    if v_table = 'tournaments' then
      -- The pre-tournament protection trigger intentionally keeps its parent
      -- row during DELETE. Restore that surviving container by updating it,
      -- without disabling the trigger or breaking its child-table guarantees.
      select string_agg(format('%I = excluded.%I', attname, attname), ', ' order by attnum) into v_updates from pg_attribute
        where attrelid = 'public.tournaments'::regclass and attnum > 0 and not attisdropped
          and attgenerated = '' and attname not in ('workspace_id', 'id');
      execute format('insert into public.tournaments (%s) select %s from jsonb_populate_recordset(null::public.tournaments, $1) on conflict (workspace_id, id) do update set %s', v_columns, v_columns, v_updates) using v_rows;
    else
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)', v_table, v_columns, v_columns, v_table) using v_rows;
    end if;
    get diagnostics v_count = row_count;
    v_summary := v_summary || jsonb_build_object(v_table, jsonb_build_object('deleted', coalesce((v_deleted->>v_table)::bigint, 0), 'inserted', v_count));
    -- Explicit IDs do not advance serial/identity sequences. Include every
    -- workspace when finding the boundary and never move a sequence backwards.
    -- RESTART is transactional; unlike setval, a later restore error rolls it back.
    for v_serial in
      select a.attname, pg_get_serial_sequence(format('public.%I', v_table), a.attname) as sequence_name
      from pg_attribute a
      where a.attrelid = to_regclass('public.' || v_table)
        and a.attnum > 0 and not a.attisdropped
        and pg_get_serial_sequence(format('public.%I', v_table), a.attname) is not null
    loop
      select seqincrement into v_sequence_increment from pg_sequence where seqrelid = v_serial.sequence_name::regclass;
      execute format('select last_value, is_called from %s', v_serial.sequence_name) into v_sequence_last_value, v_sequence_is_called;
      v_sequence_next := v_sequence_last_value + case when v_sequence_is_called then v_sequence_increment else 0 end;
      execute format('select %s(%I)::bigint from public.%I', case when v_sequence_increment > 0 then 'max' else 'min' end, v_serial.attname, v_table)
        into v_sequence_boundary;
      v_sequence_next := case when v_sequence_increment > 0
        then greatest(v_sequence_next, coalesce(v_sequence_boundary + v_sequence_increment, v_sequence_next))
        else least(v_sequence_next, coalesce(v_sequence_boundary + v_sequence_increment, v_sequence_next)) end;
      execute format('alter sequence %s restart with %s', v_serial.sequence_name, v_sequence_next);
    end loop;
  end loop;

  select * into v_current from public.workspace_state where workspace_id = p_workspace_id for update;
  select greatest(coalesce(v_current.version, 0), coalesce(max(version), 0)) + 1 into v_next_version
    from public.workspace_state_versions where workspace_id = p_workspace_id;
  insert into public.workspace_state(workspace_id, state, updated_at, version, last_operation_id, primary_epoch)
    values(p_workspace_id, v_state, v_now, v_next_version, 'restore:' || p_operation_id, v_epoch)
    on conflict(workspace_id) do update set state = excluded.state, updated_at = excluded.updated_at,
      version = excluded.version, last_operation_id = excluded.last_operation_id, primary_epoch = excluded.primary_epoch;
  -- Capture a restore version even if the snapshot itself happens to be equal.
  insert into public.workspace_state_versions(workspace_id, version, operation_id, primary_epoch, state, state_bytes, checksum, created_at, created_by)
    values(p_workspace_id, v_next_version, 'restore:' || p_operation_id, v_epoch, v_state, octet_length(v_state::text), md5(v_state::text), v_now, p_actor_id)
    on conflict(workspace_id, version) do nothing;
  insert into public.public_workspace_state(workspace_id, state, updated_at)
    values(p_workspace_id, v_public_state, v_now)
    on conflict(workspace_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  perform public.flbp_upsert_public_workspace_live(p_workspace_id, v_public_state, v_now);
  v_summary := v_summary || jsonb_build_object('workspace_state', jsonb_build_object('deleted', 0, 'inserted', 1), 'public_workspace_state', jsonb_build_object('deleted', 0, 'inserted', 1));
  v_result := jsonb_build_object('ok', true, 'workspaceId', p_workspace_id, 'operationId', p_operation_id,
    'checkpointId', p_operation_id, 'version', v_next_version, 'summary', v_summary, 'warnings', v_warnings);
  update public.database_restore_checkpoints set result = v_result where workspace_id = p_workspace_id and operation_id = p_operation_id;
  return v_result;
end;
$$;
revoke all on function public.flbp_restore_application_database(text, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.flbp_restore_application_database(text, jsonb, uuid, text, text) to service_role;
