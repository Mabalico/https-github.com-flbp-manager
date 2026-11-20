-- Automatic return to cloud authority after a forgotten local mode.
--
-- When the tournament PC is switched off without "Chiudi modalità locale",
-- its lease expires and the coordinator reports `recovery`: every Admin window
-- stays read-only until someone restarts that PC. This function lets an Admin
-- session take cloud authority back once the PC has been silent for a grace
-- period long enough to cover an Internet outage during a tournament.
--
-- Rules, checked under the same advisory lock as every data-plane transition:
-- - only a `local` plane whose lease expired at least 12 hours ago qualifies;
-- - if the remote journal holds operations newer than the cloud snapshot, the
--   switch needs p_accept_missing = true (those operations are not replayed);
-- - the epoch advances exactly as in flbp_admin_force_cloud_failover, so the
--   old node is fenced: its next heartbeat is refused and it goes to standby.
-- A refused attempt returns ok = false with a reason instead of raising, so the
-- Admin UI can explain when the site will unlock.

create or replace function public.flbp_admin_reclaim_cloud_data_plane(
  p_workspace_id text default 'default',
  p_expected_epoch bigint default 0,
  p_accept_missing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_grace constant interval := interval '12 hours';
  v_plane record;
  v_cloud_version bigint := 0;
  v_missing bigint := 0;
  v_last_missing_at timestamptz;
  v_reclaim_at timestamptz;
  v_new_epoch bigint;
begin
  if not public.flbp_is_admin() then raise exception 'Accesso admin richiesto'; end if;

  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || v_workspace_id));
  select * into v_plane
  from public.flbp_data_plane
  where workspace_id = v_workspace_id
  for update;

  if not found or v_plane.mode = 'cloud' then
    return jsonb_build_object(
      'ok', true, 'reclaimed', false, 'mode', 'cloud',
      'epoch', coalesce(v_plane.epoch, 0)
    );
  end if;
  if v_plane.epoch <> coalesce(p_expected_epoch, -1) then
    return jsonb_build_object('ok', false, 'reason', 'epoch_changed', 'epoch', v_plane.epoch);
  end if;
  if v_plane.mode <> 'local' or v_plane.lease_expires_at is null then
    return jsonb_build_object('ok', false, 'reason', 'manual_recovery_required', 'epoch', v_plane.epoch);
  end if;
  if v_plane.lease_expires_at > now() then
    return jsonb_build_object(
      'ok', false, 'reason', 'local_active', 'epoch', v_plane.epoch,
      'lease_expires_at', v_plane.lease_expires_at
    );
  end if;

  select coalesce(max(version), 0) into v_cloud_version
  from public.workspace_state
  where workspace_id = v_workspace_id;
  select count(*), max(created_at) into v_missing, v_last_missing_at
  from public.flbp_local_operation_log
  where workspace_id = v_workspace_id
    and primary_epoch = v_plane.epoch
    and local_version > v_cloud_version;

  v_reclaim_at := v_plane.lease_expires_at + v_grace;
  if now() < v_reclaim_at then
    return jsonb_build_object(
      'ok', false, 'reason', 'grace', 'epoch', v_plane.epoch,
      'lease_expired_at', v_plane.lease_expires_at,
      'reclaim_at', v_reclaim_at,
      'missing_operations', v_missing,
      'last_backup_at', v_plane.last_backup_at
    );
  end if;
  if v_missing > 0 and not coalesce(p_accept_missing, false) then
    return jsonb_build_object(
      'ok', false, 'reason', 'missing_operations', 'epoch', v_plane.epoch,
      'lease_expired_at', v_plane.lease_expires_at,
      'missing_operations', v_missing,
      'last_missing_operation_at', v_last_missing_at,
      'last_backup_at', v_plane.last_backup_at
    );
  end if;

  v_new_epoch := v_plane.epoch + 1;
  update public.flbp_data_plane set
    mode = 'cloud', node_id = null, base_url = null,
    epoch = v_new_epoch, lease_expires_at = null, updated_at = now()
  where workspace_id = v_workspace_id;

  return jsonb_build_object(
    'ok', true, 'reclaimed', true, 'mode', 'cloud', 'epoch', v_new_epoch,
    'lease_expired_at', v_plane.lease_expires_at,
    'missing_operations', v_missing,
    'last_backup_at', v_plane.last_backup_at
  );
end;
$$;

revoke all on function public.flbp_admin_reclaim_cloud_data_plane(text, bigint, boolean) from public, anon;
grant execute on function public.flbp_admin_reclaim_cloud_data_plane(text, bigint, boolean) to authenticated;
