-- Device hand-over between player accounts on the same phone.
-- player_app_devices is keyed by the installation id (primary key `id`) and its
-- UPDATE policy only lets the current owner touch the row. When account A logs out
-- offline and account B logs in on the same phone, B's upsert on that id is rejected
-- by RLS (42501): B never receives calls and A keeps receiving them.
-- This RPC reassigns the installation's row to the calling user. It does not widen
-- the table policies: it is SECURITY DEFINER, always uses auth.uid() as the new
-- owner and is callable by signed-in users only (never by anon).
-- Additive and safe to reapply.

create or replace function public.flbp_player_claim_device(
  p_workspace_id text,
  p_device_id text,
  p_platform text,
  p_device_token text default null,
  p_push_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_device_id text := nullif(trim(coalesce(p_device_id, '')), '');
  v_platform text := lower(nullif(trim(coalesce(p_platform, '')), ''));
  v_device_token text := nullif(trim(coalesce(p_device_token, '')), '');
  v_push_enabled boolean := coalesce(p_push_enabled, true);
  v_row public.player_app_devices%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessione player non valida' using errcode = '42501';
  end if;

  if v_workspace_id is null or v_device_id is null or v_platform is null then
    raise exception 'Parametri dispositivo non validi' using errcode = '22023';
  end if;

  if v_platform not in ('web', 'android', 'ios') then
    raise exception 'Piattaforma dispositivo non valida' using errcode = '22023';
  end if;

  insert into public.player_app_devices as d (
    id,
    workspace_id,
    user_id,
    platform,
    device_token,
    push_enabled
  )
  values (
    v_device_id,
    v_workspace_id,
    v_user_id,
    v_platform,
    v_device_token,
    v_push_enabled
  )
  on conflict (id) do update
  set workspace_id = excluded.workspace_id,
      user_id = excluded.user_id,
      platform = excluded.platform,
      device_token = excluded.device_token,
      push_enabled = excluded.push_enabled,
      updated_at = now()
  returning d.* into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.flbp_player_claim_device(text, text, text, text, boolean) from public, anon;
grant execute on function public.flbp_player_claim_device(text, text, text, text, boolean) to authenticated, service_role;
