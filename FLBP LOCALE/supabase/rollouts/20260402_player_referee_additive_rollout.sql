-- FLBP Manager Suite - additive rollout bundle
-- Date: 2026-04-02
--
-- Scope:
-- - referee protected live-state pull
-- - player app profiles/devices/calls
-- - admin catalog for player accounts
--
-- Notes:
-- - additive only
-- - does not replace current web RPCs
-- - safe to apply before the related UI is fully activated

begin;

-- ===== BEGIN 20260328000100_referee_pull_live_state_rpc.sql =====
create or replace function public.flbp_referee_pull_live_state(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_updated_at timestamptz;
begin
  select ws.state, ws.updated_at
  into v_state, v_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  limit 1;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'workspace_missing');
  end if;

  v_tournament_id := coalesce(v_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_mismatch');
  end if;

  v_expected_password := coalesce(v_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_config');
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;

  v_auth_version := nullif(v_state -> 'tournament' ->> 'refereesAuthVersion', '');

  return jsonb_build_object(
    'ok', true,
    'auth_version', v_auth_version,
    'updated_at', v_updated_at,
    'state', v_state
  );
end;
$$;

grant execute on function public.flbp_referee_pull_live_state(text, text, text) to anon, authenticated;
-- ===== END 20260328000100_referee_pull_live_state_rpc.sql =====

-- ===== BEGIN 20260328000200_player_app_accounts_and_calls.sql =====
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
-- ===== END 20260328000200_player_app_accounts_and_calls.sql =====

-- ===== BEGIN 20260330000100_player_app_admin_accounts.sql =====
create or replace function public.flbp_admin_list_player_accounts(
  p_workspace_id text,
  p_origin text default null
)
returns table (
  user_id uuid,
  email text,
  providers text[],
  primary_provider text,
  created_at timestamptz,
  last_login_at timestamptz,
  linked_player_name text,
  birth_date date,
  canonical_player_id text,
  has_profile boolean,
  device_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_origin text := lower(nullif(trim(coalesce(p_origin, '')), ''));
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  return query
  with identity_rows as (
    select
      u.id as user_id,
      case
        when lower(coalesce(i.provider, '')) in ('email', 'password') then 'in_app'
        when lower(coalesce(i.provider, '')) in ('google', 'facebook', 'apple') then lower(i.provider)
        when nullif(trim(u.email), '') is not null then 'in_app'
        else 'other'
      end as origin
    from auth.users u
    left join auth.identities i on i.user_id = u.id
  ),
  aggregated_origins as (
    select
      ir.user_id,
      array_remove(array_agg(distinct ir.origin), null) as origins
    from identity_rows ir
    group by ir.user_id
  ),
  device_counts as (
    select
      d.workspace_id,
      d.user_id,
      count(*)::int as device_count
    from public.player_app_devices d
    where d.workspace_id = v_workspace_id
    group by d.workspace_id, d.user_id
  )
  select
    u.id,
    nullif(trim(u.email), '') as email,
    coalesce(
      ao.origins,
      case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
    ) as providers,
    coalesce(
      (
        coalesce(
          ao.origins,
          case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
        )
      )[1],
      'other'
    ) as primary_provider,
    u.created_at,
    u.last_sign_in_at,
    prof.canonical_player_name,
    prof.birth_date,
    prof.canonical_player_id,
    (prof.user_id is not null) as has_profile,
    coalesce(dc.device_count, 0) as device_count
  from auth.users u
  left join aggregated_origins ao on ao.user_id = u.id
  left join public.player_app_profiles prof
    on prof.workspace_id = v_workspace_id
   and prof.user_id = u.id
  left join device_counts dc
    on dc.workspace_id = v_workspace_id
   and dc.user_id = u.id
  where (
    prof.user_id is not null
    or dc.device_count is not null
    or ao.user_id is not null
  )
  and (
    v_origin is null
    or v_origin = 'all'
    or v_origin = any(
      coalesce(
        ao.origins,
        case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
      )
    )
  )
  order by coalesce(u.last_sign_in_at, u.created_at) desc nulls last, nullif(trim(u.email), '') asc nulls last;
end;
$$;

grant execute on function public.flbp_admin_list_player_accounts(text, text) to authenticated;
-- ===== END 20260330000100_player_app_admin_accounts.sql =====

commit;
