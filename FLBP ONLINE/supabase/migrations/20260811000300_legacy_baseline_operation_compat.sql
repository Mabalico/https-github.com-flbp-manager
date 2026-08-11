-- Compatibility for workspaces created before last_operation_id existed.
-- Adoption is allowed only when version and full private state are identical;
-- it can never turn a divergent snapshot into a successful backup.
create or replace function public.flbp_local_adopt_legacy_baseline(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_state jsonb,
  p_version bigint,
  p_operation_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plane public.flbp_data_plane%rowtype;
  v_cloud public.workspace_state%rowtype;
  v_operation_id text := trim(coalesce(p_operation_id, ''));
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  if v_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then
    raise exception 'FLBP_INVALID_OPERATION: operation_id baseline non valido';
  end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = p_workspace_id for update;
  if not found or v_plane.mode not in ('local', 'recovery')
    or v_plane.node_id <> p_node_id or v_plane.epoch <> p_epoch
  then
    raise exception 'FLBP_EPOCH_FENCED: adozione baseline rifiutata';
  end if;
  select * into v_cloud from public.workspace_state
  where workspace_id = p_workspace_id for update;
  if not found or v_cloud.version <> p_version or v_cloud.state is distinct from coalesce(p_state, '{}'::jsonb) then
    return false;
  end if;
  if nullif(trim(coalesce(v_cloud.last_operation_id, '')), '') is not null then
    return v_cloud.last_operation_id = v_operation_id;
  end if;

  perform set_config(
    'flbp.local_backup_context',
    p_workspace_id || ':' || p_node_id || ':' || p_epoch::text,
    true
  );
  update public.workspace_state set
    last_operation_id = v_operation_id,
    primary_epoch = p_epoch
  where workspace_id = p_workspace_id
    and version = p_version
    and last_operation_id is null
    and state is not distinct from coalesce(p_state, '{}'::jsonb);
  return found;
end;
$$;

create or replace function public.flbp_local_activate_data_plane_v3(
  p_workspace_id text,
  p_node_id text,
  p_base_url text,
  p_public_read_mode text,
  p_expected_cloud_version bigint,
  p_expected_cloud_operation_id text,
  p_expected_cloud_state jsonb,
  p_expected_public_state jsonb,
  p_expected_plane_epoch bigint,
  p_expected_recovered_version bigint,
  p_local_baseline_operation_id text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_epoch bigint;
  v_adopted boolean := false;
begin
  v_result := public.flbp_local_activate_data_plane_v2(
    p_workspace_id, p_node_id, p_base_url, p_public_read_mode,
    p_expected_cloud_version, p_expected_cloud_operation_id,
    p_expected_cloud_state, p_expected_public_state,
    p_expected_plane_epoch, p_expected_recovered_version, p_ttl_seconds
  );
  v_epoch := (v_result->>'epoch')::bigint;
  if nullif(trim(coalesce(p_expected_cloud_operation_id, '')), '') is null
    and p_expected_recovered_version = p_expected_cloud_version
  then
    v_adopted := public.flbp_local_adopt_legacy_baseline(
      p_workspace_id, p_node_id, v_epoch, p_expected_cloud_state,
      p_expected_cloud_version, p_local_baseline_operation_id
    );
    if not v_adopted then
      raise exception 'FLBP_ACTIVATION_CHANGED: baseline legacy non adottabile';
    end if;
  end if;
  return v_result || jsonb_build_object(
    'baseline_operation_id', p_local_baseline_operation_id,
    'legacy_baseline_adopted', v_adopted
  );
end;
$$;

create or replace function public.flbp_local_backup_data_plane_v2(
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
begin
  perform public.flbp_local_adopt_legacy_baseline(
    p_workspace_id, p_node_id, p_epoch, p_state, p_version, p_operation_id
  );
  return public.flbp_local_backup_data_plane(
    p_workspace_id, p_node_id, p_epoch,
    p_state, p_public_state, p_version, p_operation_id
  );
end;
$$;

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
begin
  perform public.flbp_local_adopt_legacy_baseline(
    p_workspace_id, p_node_id, p_epoch, p_state, p_version, p_operation_id
  );
  return public.flbp_local_deactivate_data_plane(
    p_workspace_id, p_node_id, p_epoch,
    p_state, p_public_state, p_version, p_operation_id
  );
end;
$$;

revoke all on function public.flbp_local_adopt_legacy_baseline(text, text, bigint, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.flbp_local_activate_data_plane_v3(text, text, text, text, bigint, text, jsonb, jsonb, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.flbp_local_backup_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.flbp_local_activate_data_plane_v3(text, text, text, text, bigint, text, jsonb, jsonb, bigint, bigint, text, integer) to service_role;
grant execute on function public.flbp_local_backup_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) to service_role;
grant execute on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) to service_role;
