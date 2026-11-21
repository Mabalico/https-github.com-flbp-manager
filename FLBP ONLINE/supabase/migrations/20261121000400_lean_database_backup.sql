-- Build the full application backup in one linear pass and keep the recovery
-- section small.
--
-- Measured on production (21/11/2026): the whole database is 55 MB, and
-- workspace_state_versions holds about 23 MB of compressed full workspace
-- states. Each version expands to several MB of jsonb. Two things still
-- pushed the export past the statement timeout after 20261121000200:
-- - the 20 exported versions still carried their full state (tens of MB);
-- - the collector appended every table with `jsonb || jsonb`, which rebuilds
--   the whole accumulated object at each step: the large workspace snapshots,
--   exported first, were copied about forty times.
--
-- Tables are now aggregated once with jsonb_object_agg. The recovery section
-- keeps only identifying metadata (version, operation, checksum, size, dates):
-- the full states and journal payloads stay in the database, and restore never
-- reads this section. The file format and restore checks are unchanged.

create or replace function public.flbp_backup_table_rows(p_table text, p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
begin
  if p_table = 'fanta_rosters' then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
    from public.fanta_rosters r join public.fanta_teams t on t.id = r.team_id
    where t.workspace_id = p_workspace_id;
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where workspace_id = $1', p_table)
      into v_rows using p_workspace_id;
  end if;
  return jsonb_build_object('rows', v_rows, 'rowCount', jsonb_array_length(v_rows));
end;
$$;
revoke all on function public.flbp_backup_table_rows(text, text) from public, anon, authenticated;

create or replace function public.flbp_backup_recovery_rows(p_table text, p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_total bigint;
  v_limit integer;
  v_order text;
  v_omitted text;
begin
  if p_table = 'workspace_state_versions' then
    v_limit := 200; v_order := 'version desc, id desc'; v_omitted := 'state';
  elsif p_table = 'flbp_local_operation_log' then
    v_limit := 500; v_order := 'id desc'; v_omitted := 'payload';
  else
    -- Single-row coordination tables (data plane, lease, live mirror).
    return public.flbp_backup_table_rows(p_table, p_workspace_id);
  end if;
  execute format('select count(*) from public.%I where workspace_id = $1', p_table)
    into v_total using p_workspace_id;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(recent) - %L order by %s), ''[]''::jsonb)
       from (select * from public.%I where workspace_id = $1 order by %s limit $2) recent',
    v_omitted, v_order, p_table, v_order)
    into v_rows using p_workspace_id, v_limit;
  return jsonb_build_object(
    'rows', v_rows,
    'rowCount', jsonb_array_length(v_rows),
    'totalRowCount', v_total,
    'truncated', v_total > jsonb_array_length(v_rows),
    'omittedColumns', jsonb_build_array(v_omitted)
  );
end;
$$;
revoke all on function public.flbp_backup_recovery_rows(text, text) from public, anon, authenticated;

create or replace function public.flbp_collect_database_backup(p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tables jsonb;
  v_recovery jsonb;
begin
  select coalesce(jsonb_object_agg(t.name, public.flbp_backup_table_rows(t.name, p_workspace_id)), '{}'::jsonb)
    into v_tables
  from unnest(public.flbp_database_backup_table_order()) as t(name)
  where to_regclass('public.' || t.name) is not null;
  -- Recovery evidence is exported, but leases/epochs are never resurrected
  -- from a file and the existing append-only history is never deleted.
  select coalesce(jsonb_object_agg(t.name, public.flbp_backup_recovery_rows(t.name, p_workspace_id)), '{}'::jsonb)
    into v_recovery
  from unnest(array['workspace_state_versions', 'flbp_local_operation_log', 'flbp_data_plane', 'admin_write_lease', 'public_workspace_live']) as t(name)
  where to_regclass('public.' || t.name) is not null;
  return jsonb_build_object(
    'exportType', 'flbp_application_database_backup', 'schemaVersion', 1,
    'workspaceId', p_workspace_id, 'exportedAt', clock_timestamp(),
    'tables', v_tables, 'recovery', v_recovery,
    'warnings', jsonb_build_array(
      'Account Auth e membership admin non vengono ripristinati. Journal e leadership sono conservati; il restore crea una nuova versione e ricostruisce il mirror live.',
      'Lo storico incluso come prova di recupero contiene solo i dati identificativi delle 200 versioni e delle 500 operazioni journal più recenti; stati completi e contenuto delle operazioni restano nel database.'
    )
  );
end;
$$;
revoke all on function public.flbp_collect_database_backup(text) from public, anon, authenticated;
