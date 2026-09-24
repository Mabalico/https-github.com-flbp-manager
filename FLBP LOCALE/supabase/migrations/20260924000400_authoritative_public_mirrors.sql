-- Public mirrors are projections of committed workspace state. A delayed
-- browser POST must never replace a newer referee result or restore snapshot.
do $migration$
declare v_table text;
begin
  foreach v_table in array array['public_workspace_state','public_workspace_live'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke insert, update, delete on public.%I from public, anon, authenticated', v_table);
    end if;
  end loop;
end;
$migration$;

-- Compatibility repair for clients which still call pushPublicWorkspaceState.
-- No browser state is accepted. Canonical Admin/referee/local-backup RPCs
-- already publish their mirrors atomically and keep working as SECURITY DEFINER.
create or replace function public.flbp_admin_republish_public_workspace(
  p_workspace_id text,
  p_lease_holder text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id,'')),'');
  v_state jsonb;
  v_current_public jsonb;
  v_public jsonb;
  v_live jsonb;
  v_updated_at timestamptz;
  v_mode text;
begin
  if not public.flbp_is_admin() then raise exception 'Accesso admin richiesto' using errcode='42501'; end if;
  if v_workspace_id is null then raise exception 'Workspace non valido'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || v_workspace_id));
  if to_regprocedure('public.flbp_admin_assert_write_lease(text,text)') is not null then
    perform public.flbp_admin_assert_write_lease(v_workspace_id,p_lease_holder);
  end if;
  if to_regclass('public.flbp_data_plane') is not null then
    execute 'select mode from public.flbp_data_plane where workspace_id=$1' into v_mode using v_workspace_id;
    if v_mode='local' then raise exception 'FLBP_LOCAL_PRIMARY: il server locale pubblica lo stato autorevole'; end if;
    if v_mode='recovery' then raise exception 'FLBP_DATA_PLANE_RECOVERY: ripubblicazione sospesa fino al recupero'; end if;
  end if;
  select state,updated_at into v_state,v_updated_at from public.workspace_state
    where workspace_id=v_workspace_id for update;
  if not found or jsonb_typeof(v_state) is distinct from 'object' then
    raise exception 'FLBP_CANONICAL_SNAPSHOT_MISSING: salvare lo stato prima della ripubblicazione';
  end if;
  select state into v_current_public from public.public_workspace_state
    where workspace_id=v_workspace_id for update;
  v_live := public.flbp_referee_public_projection(v_state,'state');
  v_live := v_live || jsonb_build_object(
    '__schemaVersion',coalesce(v_live->'__schemaVersion','1'::jsonb),
    'teams',coalesce(v_live->'teams','[]'::jsonb),
    'tournament',coalesce(v_live->'tournament','null'::jsonb),
    'tournamentMatches',public.flbp_referee_public_projection(
      jsonb_build_object('tournamentMatches',public.flbp_referee_collect_matches(v_state)),
      'state')->'tournamentMatches'
  );
  v_public := ((case when jsonb_typeof(v_current_public)='object' then v_current_public else
      '{"logoUrl":"","tournamentHistory":[],"hallOfFame":[],"integrationsScorers":[]}'::jsonb end)
    - array['__schemaVersion','teams','tournament','tournamentMatches','fantaSettings']) || v_live;
  insert into public.public_workspace_state(workspace_id,state,updated_at)
    values(v_workspace_id,v_public,v_updated_at)
    on conflict(workspace_id) do update set state=excluded.state,updated_at=excluded.updated_at
      where public.public_workspace_state.state is distinct from excluded.state
         or public.public_workspace_state.updated_at is distinct from excluded.updated_at;
  if to_regprocedure('public.flbp_upsert_public_workspace_live(text,jsonb,timestamp with time zone)') is not null then
    perform public.flbp_upsert_public_workspace_live(v_workspace_id,v_public,v_updated_at);
  end if;
  return jsonb_build_object('workspace_id',v_workspace_id,'state',v_public,'updated_at',v_updated_at);
end;
$$;
revoke all on function public.flbp_admin_republish_public_workspace(text,text) from public,anon;
grant execute on function public.flbp_admin_republish_public_workspace(text,text) to authenticated,service_role;

-- A direct SQL/REST writer owns a relation lock before its row trigger can
-- acquire the data-plane advisory. Never wait for that relation while owning
-- advisory: abort BEFORE collecting/checkpointing/deleting, then let a caller
-- retry the complete transaction. Keep the historical migration immutable.
do $migration$
declare v_function record; v_definition text; v_updated text;
begin
  for v_function in
    select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('flbp_export_application_database','flbp_restore_application_database')
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('A11_BACKUP_NOWAIT' in v_definition)>0 then continue; end if;
    v_updated := replace(v_definition,
      'execute format(''lock table public.%I in share mode'', v_table);',
      E'-- A11_BACKUP_NOWAIT\n      begin\n        execute format(''lock table public.%I in share mode nowait'', v_table);\n      exception when lock_not_available then\n        raise exception ''FLBP_DATABASE_BUSY: database in uso; riprovare l''''intera operazione'' using errcode=''P0001'';\n      end;');
    v_updated := replace(v_updated,
      'execute format(''lock table public.%I in share row exclusive mode'', v_table);',
      E'-- A11_BACKUP_NOWAIT\n      begin\n        execute format(''lock table public.%I in share row exclusive mode nowait'', v_table);\n      exception when lock_not_available then\n        raise exception ''FLBP_DATABASE_BUSY: database in uso; riprovare l''''intera operazione'' using errcode=''P0001'';\n      end;');
    if v_updated=v_definition then raise exception 'A11: definizione backup non riconosciuta: %',v_function.proname; end if;
    execute v_updated;
  end loop;
end;
$migration$;
