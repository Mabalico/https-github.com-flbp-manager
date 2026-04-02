create table if not exists public.player_app_profiles (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  canonical_player_id text null,
  canonical_player_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_player_app_profiles_workspace_player
  on public.player_app_profiles(workspace_id, canonical_player_id);

create table if not exists public.player_app_devices (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  platform text not null check (platform in ('web', 'android', 'ios')),
  device_token text null,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_app_devices_workspace_user
  on public.player_app_devices(workspace_id, user_id);

create table if not exists public.player_app_calls (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  tournament_id text not null,
  team_id text not null,
  team_name text null,
  target_user_id uuid not null,
  target_player_id text null,
  target_player_name text null,
  requested_by_user_id uuid null,
  status text not null check (status in ('ringing', 'acknowledged', 'cancelled', 'expired')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_player_app_calls_workspace_target
  on public.player_app_calls(workspace_id, target_user_id, requested_at desc);

create index if not exists idx_player_app_calls_workspace_team
  on public.player_app_calls(workspace_id, tournament_id, team_id, requested_at desc);

alter table public.player_app_profiles enable row level security;
alter table public.player_app_devices enable row level security;
alter table public.player_app_calls enable row level security;

drop policy if exists player_app_profiles_owner_select on public.player_app_profiles;
create policy player_app_profiles_owner_select on public.player_app_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists player_app_profiles_owner_insert on public.player_app_profiles;
create policy player_app_profiles_owner_insert on public.player_app_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists player_app_profiles_owner_update on public.player_app_profiles;
create policy player_app_profiles_owner_update on public.player_app_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists player_app_profiles_admin_all on public.player_app_profiles;
create policy player_app_profiles_admin_all on public.player_app_profiles
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists player_app_devices_owner_select on public.player_app_devices;
create policy player_app_devices_owner_select on public.player_app_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists player_app_devices_owner_insert on public.player_app_devices;
create policy player_app_devices_owner_insert on public.player_app_devices
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists player_app_devices_owner_update on public.player_app_devices;
create policy player_app_devices_owner_update on public.player_app_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists player_app_devices_admin_all on public.player_app_devices;
create policy player_app_devices_admin_all on public.player_app_devices
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists player_app_calls_target_select on public.player_app_calls;
create policy player_app_calls_target_select on public.player_app_calls
  for select
  to authenticated
  using (auth.uid() = target_user_id);

drop policy if exists player_app_calls_admin_select on public.player_app_calls;
create policy player_app_calls_admin_select on public.player_app_calls
  for select
  to authenticated
  using (public.flbp_is_admin());

grant select, insert, update on public.player_app_profiles to authenticated;
grant select, insert, update on public.player_app_devices to authenticated;
grant select on public.player_app_calls to authenticated;

create or replace function public.flbp_player_call_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_id text,
  p_team_name text default null,
  p_target_user_id uuid default null,
  p_target_player_id text default null,
  p_target_player_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_team_id text := nullif(trim(coalesce(p_team_id, '')), '');
  v_call_id text := 'call_' || replace(gen_random_uuid()::text, '-', '');
  v_requested_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null or v_tournament_id is null or v_team_id is null or p_target_user_id is null then
    raise exception 'Parametri convocazione non validi';
  end if;

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  update public.player_app_calls
  set status = 'cancelled',
      cancelled_at = v_requested_at
  where workspace_id = v_workspace_id
    and tournament_id = v_tournament_id
    and team_id = v_team_id
    and status in ('ringing', 'acknowledged');

  insert into public.player_app_calls (
    id,
    workspace_id,
    tournament_id,
    team_id,
    team_name,
    target_user_id,
    target_player_id,
    target_player_name,
    requested_by_user_id,
    status,
    requested_at,
    metadata
  )
  values (
    v_call_id,
    v_workspace_id,
    v_tournament_id,
    v_team_id,
    nullif(trim(coalesce(p_team_name, '')), ''),
    p_target_user_id,
    nullif(trim(coalesce(p_target_player_id, '')), ''),
    nullif(trim(coalesce(p_target_player_name, '')), ''),
    auth.uid(),
    'ringing',
    v_requested_at,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'ringing',
    'requested_at', v_requested_at
  );
end;
$$;

create or replace function public.flbp_player_ack_call(
  p_workspace_id text,
  p_call_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_call_id text := nullif(trim(coalesce(p_call_id, '')), '');
  v_row public.player_app_calls%rowtype;
  v_ack_at timestamptz := now();
begin
  if v_workspace_id is null or v_call_id is null then
    raise exception 'Convocazione non valida';
  end if;

  select *
  into v_row
  from public.player_app_calls
  where id = v_call_id
    and workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception 'Convocazione non trovata';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from v_row.target_user_id then
    raise exception 'Convocazione non assegnata a questo utente';
  end if;

  update public.player_app_calls
  set status = 'acknowledged',
      acknowledged_at = v_ack_at,
      cancelled_at = null
  where id = v_call_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'acknowledged',
    'acknowledged_at', v_ack_at
  );
end;
$$;

create or replace function public.flbp_player_cancel_call(
  p_workspace_id text,
  p_call_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_call_id text := nullif(trim(coalesce(p_call_id, '')), '');
  v_cancel_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null or v_call_id is null then
    raise exception 'Convocazione non valida';
  end if;

  update public.player_app_calls
  set status = 'cancelled',
      cancelled_at = v_cancel_at
  where id = v_call_id
    and workspace_id = v_workspace_id;

  if not found then
    raise exception 'Convocazione non trovata';
  end if;

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'cancelled',
    'cancelled_at', v_cancel_at
  );
end;
$$;

grant execute on function public.flbp_player_call_team(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.flbp_player_ack_call(text, text) to authenticated;
grant execute on function public.flbp_player_cancel_call(text, text) to authenticated;
