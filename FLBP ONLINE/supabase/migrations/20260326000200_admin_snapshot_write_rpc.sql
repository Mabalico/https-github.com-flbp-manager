-- FLBP Manager Suite - atomic admin snapshot write RPC
--
-- Goals:
-- - move admin snapshot conflict checks to the database
-- - avoid client-side race windows between preflight read and write
-- - update workspace_state + public_workspace_state atomically

create or replace function public.flbp_admin_push_workspace_state(
  p_workspace_id text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := now();
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  select ws.updated_at
  into v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if not coalesce(p_force, false) and v_current_updated_at is not null then
    if p_base_updated_at is null then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene gia'' uno snapshot admin piu'' recente'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;

    if v_current_updated_at is distinct from p_base_updated_at then
      raise exception 'FLBP_DB_CONFLICT: il DB e'' stato aggiornato da un altro admin'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;
  end if;

  insert into public.workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean) to authenticated;
