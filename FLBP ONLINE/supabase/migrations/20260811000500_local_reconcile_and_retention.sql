-- Safe recovery for ambiguous local transitions and bounded snapshot history.

alter table public.flbp_data_plane
  add column if not exists last_local_node_id text;

update public.flbp_data_plane
set last_local_node_id = node_id
where mode in ('local', 'recovery') and node_id is not null and last_local_node_id is null;

-- Preserve the node identity across the atomic switch back to cloud. The base
-- function intentionally clears node_id; this wrapper records the former
-- leader so a later reconciliation can prove that the same PC completed it.
create or replace function public.flbp_local_deactivate_data_plane_v2(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_state jsonb,
  p_public_state jsonb,
  p_version bigint,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plane public.flbp_data_plane%rowtype;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = p_workspace_id for update;

  if found and v_plane.mode = 'cloud' and v_plane.epoch = p_epoch then
    if v_plane.last_local_node_id is distinct from p_node_id then
      raise exception 'FLBP_EPOCH_FENCED: nodo della disattivazione già conclusa non corrispondente';
    end if;
    return public.flbp_local_deactivate_data_plane(
      p_workspace_id, p_node_id, p_epoch,
      p_state, p_public_state, p_version, p_operation_id
    );
  end if;

  perform public.flbp_local_adopt_legacy_baseline(
    p_workspace_id, p_node_id, p_epoch, p_state, p_version, p_operation_id
  );
  v_result := public.flbp_local_deactivate_data_plane(
    p_workspace_id, p_node_id, p_epoch,
    p_state, p_public_state, p_version, p_operation_id
  );
  update public.flbp_data_plane
  set last_local_node_id = p_node_id
  where workspace_id = p_workspace_id and epoch = p_epoch and mode = 'cloud';
  return v_result;
end;
$$;

create or replace function public.flbp_local_reconcile_data_plane(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_local_version bigint,
  p_local_operation_id text,
  p_ttl_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_plane public.flbp_data_plane%rowtype;
  v_cloud public.workspace_state%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  if nullif(trim(coalesce(p_node_id, '')), '') is null then raise exception 'node_id mancante'; end if;
  if coalesce(p_epoch, 0) <= 0 then raise exception 'primary_epoch mancante'; end if;

  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || v_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = v_workspace_id for update;
  select * into v_cloud from public.workspace_state
  where workspace_id = v_workspace_id for update;

  if v_plane.workspace_id is not null and v_plane.mode = 'local'
     and v_plane.node_id = p_node_id and v_plane.epoch = p_epoch then
    update public.flbp_data_plane set
      heartbeat_at = v_now,
      lease_expires_at = v_now + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 60), 300))),
      updated_at = v_now
    where workspace_id = v_workspace_id;
    return jsonb_build_object(
      'ok', true, 'action', 'resume-local', 'accepted', true,
      'authority', 'local', 'node_id', v_plane.node_id, 'epoch', v_plane.epoch,
      'lease_expires_at', v_now + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 60), 300)))
    );
  end if;

  if v_plane.workspace_id is not null and v_plane.mode = 'cloud'
     and v_plane.epoch = p_epoch
     and v_plane.last_local_node_id = p_node_id
     and v_cloud.version = p_local_version
     and v_cloud.last_operation_id is not distinct from p_local_operation_id then
    return jsonb_build_object(
      'ok', true, 'action', 'standby-cloud', 'accepted', true,
      'authority', 'cloud', 'node_id', v_plane.last_local_node_id, 'epoch', v_plane.epoch,
      'version', v_cloud.version, 'operation_id', v_cloud.last_operation_id
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'action', 'fenced', 'accepted', false,
    'authority', coalesce(v_plane.mode, 'cloud'),
    'epoch', coalesce(v_plane.epoch, 0),
    'node_id_matches', coalesce(v_plane.node_id = p_node_id, false),
    'cloud_version', v_cloud.version,
    'cloud_operation_id', v_cloud.last_operation_id
  );
end;
$$;

create or replace function public.flbp_local_prune_workspace_history(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_retention_days integer default 90,
  p_min_versions integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_plane public.flbp_data_plane%rowtype;
  v_deleted bigint := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  select * into v_plane from public.flbp_data_plane where workspace_id = v_workspace_id;
  if not found or v_plane.mode <> 'local' or v_plane.node_id <> p_node_id or v_plane.epoch <> p_epoch then
    raise exception 'FLBP_EPOCH_FENCED: retention rifiutata per nodo/epoch non primario';
  end if;

  with ranked as (
    select id, row_number() over (order by version desc, id desc) as position
    from public.workspace_state_versions
    where workspace_id = v_workspace_id
  ), deleted as (
    delete from public.workspace_state_versions versions
    using ranked
    where versions.id = ranked.id
      and ranked.position > greatest(100, least(coalesce(p_min_versions, 2000), 100000))
      and versions.created_at < now() - make_interval(days => greatest(7, least(coalesce(p_retention_days, 90), 3650)))
      and not exists (
        select 1 from public.workspace_state current_state
        where current_state.workspace_id = versions.workspace_id
          and current_state.last_operation_id is not distinct from versions.operation_id
      )
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.flbp_local_reconcile_data_plane(text, text, bigint, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.flbp_local_reconcile_data_plane(text, text, bigint, bigint, text, integer) to service_role;
revoke all on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) to service_role;
revoke all on function public.flbp_local_prune_workspace_history(text, text, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.flbp_local_prune_workspace_history(text, text, bigint, integer, integer) to service_role;
