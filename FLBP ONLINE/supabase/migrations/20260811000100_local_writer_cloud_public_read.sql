-- Local tournament writer with cloud-backed public reads.
-- The PC remains the only writer, while public visitors keep reading the
-- periodically published Supabase mirror. A public tunnel is therefore optional.

alter table public.flbp_data_plane
  add column if not exists public_read_mode text not null default 'local'
    check (public_read_mode in ('local', 'cloud')),
  add column if not exists last_public_version bigint,
  add column if not exists last_public_operation_id text;

alter table public.flbp_data_plane drop constraint if exists flbp_data_plane_local_fields;
alter table public.flbp_data_plane add constraint flbp_data_plane_local_fields check (
  mode <> 'local' or (
    node_id is not null
    and lease_expires_at is not null
    and (public_read_mode = 'cloud' or base_url is not null)
  )
);

-- Reuse the already audited compare-and-switch implementation. In cloud-read
-- mode the temporary URL exists only inside this transaction and is removed
-- before another transaction can observe it.
create or replace function public.flbp_local_activate_data_plane_v2(
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
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_read_mode text := lower(trim(coalesce(p_public_read_mode, 'cloud')));
  v_base_url text := nullif(trim(coalesce(p_base_url, '')), '');
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  if v_read_mode not in ('local', 'cloud') then raise exception 'public_read_mode non valido'; end if;
  if v_read_mode = 'local' and (v_base_url is null or v_base_url !~ '^https://') then
    raise exception 'base_url HTTPS obbligatorio per le letture pubbliche locali';
  end if;

  v_result := public.flbp_local_activate_data_plane(
    v_workspace_id,
    p_node_id,
    case when v_read_mode = 'local' then v_base_url else 'https://cloud-read.invalid' end,
    p_expected_cloud_version,
    p_expected_cloud_operation_id,
    p_expected_cloud_state,
    p_expected_public_state,
    p_expected_plane_epoch,
    p_expected_recovered_version,
    p_ttl_seconds
  );

  update public.flbp_data_plane set
    public_read_mode = v_read_mode,
    base_url = case when v_read_mode = 'local' then v_base_url else null end,
    last_public_version = null,
    last_public_operation_id = null,
    updated_at = now()
  where workspace_id = v_workspace_id
    and node_id = p_node_id
    and epoch = (v_result->>'epoch')::bigint;

  return v_result || jsonb_build_object('public_read_mode', v_read_mode);
end;
$$;

-- Public clients are intentionally kept on the Supabase mirror while the PC
-- owns write authority. Same-origin clients served by the PC discover the
-- local endpoint before calling this resolver.
create or replace function public.flbp_resolve_data_plane(p_workspace_id text default 'default')
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plane record;
begin
  select * into v_plane from public.flbp_data_plane where workspace_id = p_workspace_id;
  if not found or v_plane.mode = 'cloud' then
    return jsonb_build_object('mode', 'cloud', 'authority', 'cloud', 'epoch', coalesce(v_plane.epoch, 0));
  end if;
  if v_plane.mode = 'local' and v_plane.lease_expires_at > now() then
    if coalesce(v_plane.public_read_mode, 'local') = 'cloud' then
      return jsonb_build_object(
        'mode', 'cloud', 'authority', 'local', 'public_read_mode', 'cloud',
        'epoch', v_plane.epoch, 'lease_expires_at', v_plane.lease_expires_at
      );
    end if;
    return jsonb_build_object(
      'mode', 'local', 'authority', 'local', 'public_read_mode', 'local',
      'base_url', v_plane.base_url, 'epoch', v_plane.epoch,
      'lease_expires_at', v_plane.lease_expires_at
    );
  end if;
  return jsonb_build_object(
    'mode', 'recovery', 'authority', 'local', 'epoch', v_plane.epoch,
    'reason', 'local_lease_expired', 'last_backup_at', v_plane.last_backup_at
  );
end;
$$;

-- Publishes only the compact live projection produced by the existing DB
-- sanitizer. Stale or colliding timer responses cannot overwrite newer data.
create or replace function public.flbp_local_publish_live_data_plane(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
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
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || p_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = p_workspace_id for update;
  if not found or v_plane.mode <> 'local'
    or v_plane.node_id <> p_node_id or v_plane.epoch <> p_epoch
  then
    raise exception 'FLBP_EPOCH_FENCED: pubblicazione live rifiutata';
  end if;
  if coalesce(p_version, 0) <= 0 then raise exception 'Versione live non valida'; end if;
  if v_plane.last_public_version is not null and p_version < v_plane.last_public_version then
    raise exception 'FLBP_DB_CONFLICT: pubblicazione live precedente alla versione già pubblicata';
  end if;
  if v_plane.last_public_version = p_version
    and coalesce(v_plane.last_public_operation_id, '') <> coalesce(p_operation_id, '')
  then
    raise exception 'FLBP_OPERATION_COLLISION: versione live associata a un’altra operazione';
  end if;

  perform set_config(
    'flbp.local_backup_context',
    p_workspace_id || ':' || p_node_id || ':' || p_epoch::text,
    true
  );
  perform public.flbp_upsert_public_workspace_live(
    p_workspace_id,
    coalesce(p_public_state, '{}'::jsonb),
    v_now
  );
  update public.flbp_data_plane set
    last_public_version = p_version,
    last_public_operation_id = p_operation_id,
    updated_at = v_now
  where workspace_id = p_workspace_id;

  return jsonb_build_object('ok', true, 'updated_at', v_now, 'version', p_version, 'epoch', p_epoch);
end;
$$;

-- Same transactional journal protocol as v1, extended with compact state patches.
create or replace function public.flbp_local_append_operations(
  p_workspace_id text,
  p_node_id text,
  p_epoch bigint,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_node_id text := nullif(trim(coalesce(p_node_id, '')), '');
  v_plane record;
  v_cloud record;
  v_cursor bigint := 0;
  v_entry jsonb;
  v_operation_id text;
  v_local_version bigint;
  v_operation_kind text;
  v_payload jsonb;
  v_created_at timestamptz;
  v_existing record;
  v_confirmed integer := 0;
  v_inserted integer := 0;
  v_idempotent integer := 0;
  v_covered integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role richiesta'; end if;
  if v_node_id is null then raise exception 'node_id mancante'; end if;
  if coalesce(p_epoch, 0) <= 0 then raise exception 'primary_epoch mancante'; end if;
  if jsonb_typeof(coalesce(p_operations, '[]'::jsonb)) <> 'array' then
    raise exception 'p_operations deve essere un array JSON';
  end if;
  if jsonb_array_length(coalesce(p_operations, '[]'::jsonb)) > 100 then
    raise exception 'Massimo 100 operazioni per batch';
  end if;

  perform pg_advisory_xact_lock(hashtext('flbp_data_plane:' || v_workspace_id));
  select * into v_plane from public.flbp_data_plane
  where workspace_id = v_workspace_id for update;
  if not found or v_plane.mode not in ('local', 'recovery')
    or v_plane.node_id <> v_node_id or v_plane.epoch <> p_epoch
  then
    raise exception 'FLBP_EPOCH_FENCED: journal rifiutato, il nodo non possiede più questo epoch';
  end if;

  select version, last_operation_id into v_cloud from public.workspace_state
  where workspace_id = v_workspace_id for update;
  v_cursor := coalesce(v_cloud.version, 0);
  select greatest(v_cursor, coalesce(max(local_version), v_cursor)) into v_cursor
  from public.flbp_local_operation_log
  where workspace_id = v_workspace_id and primary_epoch = p_epoch;

  for v_entry in
    select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb)) with ordinality
    order by ordinality
  loop
    v_operation_id := trim(coalesce(v_entry->>'operation_id', ''));
    v_local_version := coalesce((v_entry->>'local_version')::bigint, 0);
    v_operation_kind := trim(coalesce(v_entry->>'operation_kind', ''));
    v_payload := coalesce(v_entry->'payload', '{}'::jsonb);
    v_created_at := (v_entry->>'created_at')::timestamptz;

    if v_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then
      raise exception 'FLBP_INVALID_OPERATION: operation_id non valido';
    end if;
    if v_local_version <= 0 then raise exception 'FLBP_INVALID_OPERATION: local_version non valida'; end if;
    if v_operation_kind not in ('workspace-snapshot', 'state-patch', 'match-result') then
      raise exception 'FLBP_INVALID_OPERATION: operation_kind non supportato';
    end if;
    if jsonb_typeof(v_payload) <> 'object' then
      raise exception 'FLBP_INVALID_OPERATION: payload deve essere un oggetto JSON';
    end if;

    select * into v_existing from public.flbp_local_operation_log
    where workspace_id = v_workspace_id and operation_id = v_operation_id;
    if found then
      if v_existing.node_id is distinct from v_node_id
        or v_existing.primary_epoch is distinct from p_epoch
        or v_existing.local_version is distinct from v_local_version
        or v_existing.operation_kind is distinct from v_operation_kind
        or v_existing.payload is distinct from v_payload
        or v_existing.created_at is distinct from v_created_at
      then
        raise exception 'FLBP_OPERATION_COLLISION: operation_id % associato a dati differenti', v_operation_id;
      end if;
      v_idempotent := v_idempotent + 1;
      v_confirmed := v_confirmed + 1;
      continue;
    end if;

    if v_local_version < coalesce(v_cloud.version, 0) then
      v_covered := v_covered + 1;
      v_confirmed := v_confirmed + 1;
      continue;
    end if;
    if v_local_version = coalesce(v_cloud.version, 0) then
      if v_operation_id <> coalesce(v_cloud.last_operation_id, '') then
        raise exception 'FLBP_OPERATION_COLLISION: versione cloud % associata a un’altra operazione', v_local_version;
      end if;
      v_covered := v_covered + 1;
      v_confirmed := v_confirmed + 1;
      continue;
    end if;
    if v_local_version <> v_cursor + 1 then
      raise exception 'FLBP_JOURNAL_GAP: attesa versione %, trovata %', v_cursor + 1, v_local_version;
    end if;

    insert into public.flbp_local_operation_log(
      workspace_id, node_id, primary_epoch, operation_id,
      local_version, operation_kind, payload, created_at
    ) values (
      v_workspace_id, v_node_id, p_epoch, v_operation_id,
      v_local_version, v_operation_kind, v_payload, v_created_at
    );
    v_cursor := v_local_version;
    v_inserted := v_inserted + 1;
    v_confirmed := v_confirmed + 1;
  end loop;

  return jsonb_build_object(
    'ok', true, 'confirmed', v_confirmed, 'inserted', v_inserted,
    'idempotent', v_idempotent, 'covered_by_snapshot', v_covered,
    'high_water_version', v_cursor
  );
end;
$$;

revoke all on function public.flbp_local_activate_data_plane_v2(text, text, text, text, bigint, text, jsonb, jsonb, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.flbp_local_publish_live_data_plane(text, text, bigint, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.flbp_local_activate_data_plane_v2(text, text, text, text, bigint, text, jsonb, jsonb, bigint, bigint, integer) to service_role;
grant execute on function public.flbp_local_publish_live_data_plane(text, text, bigint, jsonb, bigint, text) to service_role;

revoke all on function public.flbp_local_append_operations(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.flbp_local_append_operations(text, text, bigint, jsonb) to service_role;

revoke all on function public.flbp_resolve_data_plane(text) from public;
grant execute on function public.flbp_resolve_data_plane(text) to anon, authenticated, service_role;
