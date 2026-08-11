-- Preserve the original idempotent retry semantics after a lost successful
-- deactivation response. Legacy adoption is needed only while the node still
-- owns a local/recovery epoch.
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
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = p_workspace_id for update;
  if found and v_plane.mode = 'cloud' and v_plane.epoch = p_epoch then
    return public.flbp_local_deactivate_data_plane(
      p_workspace_id, p_node_id, p_epoch,
      p_state, p_public_state, p_version, p_operation_id
    );
  end if;
  perform public.flbp_local_adopt_legacy_baseline(
    p_workspace_id, p_node_id, p_epoch, p_state, p_version, p_operation_id
  );
  return public.flbp_local_deactivate_data_plane(
    p_workspace_id, p_node_id, p_epoch,
    p_state, p_public_state, p_version, p_operation_id
  );
end;
$$;

revoke all on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.flbp_local_deactivate_data_plane_v2(text, text, bigint, jsonb, jsonb, bigint, text) to service_role;
