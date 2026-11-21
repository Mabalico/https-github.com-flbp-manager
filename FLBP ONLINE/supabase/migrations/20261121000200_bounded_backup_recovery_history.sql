-- Keep the full application backup within the statement timeout.
--
-- The backup collector also exported, as recovery evidence, every row of
-- workspace_state_versions and flbp_local_operation_log. Each version holds a
-- complete workspace state and the cloud never prunes them, so after months of
-- use the export (and the pre-restore checkpoint built by the same collector)
-- ran past the statement timeout. Restore never reads this section.
--
-- The application tables are still exported in full. The recovery section now
-- keeps the 20 most recent versions and the 500 most recent journal operations,
-- with the total row count and a truncated flag. Nothing is deleted from the
-- history tables.

create or replace function public.flbp_collect_database_backup(p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_rows jsonb;
  v_total bigint;
  v_limit integer;
  v_order text;
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
    v_limit := case v_table when 'workspace_state_versions' then 20 when 'flbp_local_operation_log' then 500 else null end;
    if v_limit is null then
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
      v_recovery := v_recovery || jsonb_build_object(v_table, jsonb_build_object('rows', v_rows, 'rowCount', jsonb_array_length(v_rows)));
      continue;
    end if;
    v_order := case v_table when 'workspace_state_versions' then 'version desc, id desc' else 'id desc' end;
    execute format('select count(*) from public.%I where workspace_id = $1', v_table)
      into v_total using p_workspace_id;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(recent) order by %s), ''[]''::jsonb)
         from (select * from public.%I where workspace_id = $1 order by %s limit $2) recent',
      v_order, v_table, v_order)
      into v_rows using p_workspace_id, v_limit;
    v_recovery := v_recovery || jsonb_build_object(v_table, jsonb_build_object(
      'rows', v_rows,
      'rowCount', jsonb_array_length(v_rows),
      'totalRowCount', v_total,
      'truncated', v_total > jsonb_array_length(v_rows)
    ));
  end loop;
  return jsonb_build_object(
    'exportType', 'flbp_application_database_backup', 'schemaVersion', 1,
    'workspaceId', p_workspace_id, 'exportedAt', clock_timestamp(),
    'tables', v_tables, 'recovery', v_recovery,
    'warnings', jsonb_build_array(
      'Account Auth e membership admin non vengono ripristinati. Journal e leadership sono conservati; il restore crea una nuova versione e ricostruisce il mirror live.',
      'Lo storico incluso come prova di recupero contiene solo le 20 versioni e le 500 operazioni journal più recenti; lo storico completo resta nel database.'
    )
  );
end;
$$;
revoke all on function public.flbp_collect_database_backup(text) from public, anon, authenticated;
