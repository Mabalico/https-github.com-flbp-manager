-- FLBP Manager Suite - small public live workspace document
--
-- public_workspace_state remains the backward-compatible full snapshot.
-- public_workspace_live stores only the public fields that change during live
-- tournaments, so polling clients do not re-download history/HOF/scorers.

create table if not exists public.public_workspace_live (
  workspace_id text primary key references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.public_workspace_live enable row level security;

drop policy if exists public_workspace_live_public_read on public.public_workspace_live;
create policy public_workspace_live_public_read
  on public.public_workspace_live
  for select
  to anon, authenticated
  using (true);

drop policy if exists public_workspace_live_admin_insert on public.public_workspace_live;
create policy public_workspace_live_admin_insert
  on public.public_workspace_live
  for insert
  to authenticated
  with check (public.flbp_is_admin());

drop policy if exists public_workspace_live_admin_update on public.public_workspace_live;
create policy public_workspace_live_admin_update
  on public.public_workspace_live
  for update
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

drop policy if exists public_workspace_live_admin_delete on public.public_workspace_live;
create policy public_workspace_live_admin_delete
  on public.public_workspace_live
  for delete
  to authenticated
  using (public.flbp_is_admin());

grant select on public.public_workspace_live to anon, authenticated;
grant insert, update, delete on public.public_workspace_live to authenticated;

create or replace function public.flbp_public_live_sanitize_team(p_team jsonb)
returns jsonb
language sql
set search_path = public
as $$
  select case
    when jsonb_typeof(p_team) = 'object'
      then p_team - 'player1YoB' - 'player2YoB' - 'player1BirthDate' - 'player2BirthDate'
    else '{}'::jsonb
  end;
$$;

revoke all on function public.flbp_public_live_sanitize_team(jsonb) from public;

create or replace function public.flbp_public_live_sanitize_teams(p_teams jsonb)
returns jsonb
language sql
set search_path = public
as $$
  select coalesce(
    jsonb_agg(public.flbp_public_live_sanitize_team(elem.value)),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_teams) = 'array' then p_teams else '[]'::jsonb end
  ) as elem(value);
$$;

revoke all on function public.flbp_public_live_sanitize_teams(jsonb) from public;

create or replace function public.flbp_public_live_sanitize_tournament(p_tournament jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tournament jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_group jsonb;
begin
  if jsonb_typeof(p_tournament) <> 'object' then
    return null;
  end if;

  v_tournament := p_tournament - 'refereesPassword';

  if jsonb_typeof(v_tournament -> 'teams') = 'array' then
    v_tournament := jsonb_set(
      v_tournament,
      '{teams}',
      public.flbp_public_live_sanitize_teams(v_tournament -> 'teams'),
      true
    );
  end if;

  if jsonb_typeof(v_tournament -> 'groups') = 'array' then
    for v_group in
      select elem.value
      from jsonb_array_elements(v_tournament -> 'groups') as elem(value)
    loop
      if jsonb_typeof(v_group -> 'teams') = 'array' then
        v_group := jsonb_set(
          v_group,
          '{teams}',
          public.flbp_public_live_sanitize_teams(v_group -> 'teams'),
          true
        );
      end if;
      v_groups := v_groups || jsonb_build_array(v_group);
    end loop;
    v_tournament := jsonb_set(v_tournament, '{groups}', v_groups, true);
  end if;

  return v_tournament;
end;
$$;

revoke all on function public.flbp_public_live_sanitize_tournament(jsonb) from public;

create or replace function public.flbp_build_public_workspace_live_state(p_public_state jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_state jsonb := coalesce(p_public_state, '{}'::jsonb);
  v_live jsonb;
begin
  v_live := jsonb_build_object(
    '__schemaVersion', coalesce(v_state -> '__schemaVersion', '1'::jsonb),
    'teams', public.flbp_public_live_sanitize_teams(v_state -> 'teams'),
    'tournament', public.flbp_public_live_sanitize_tournament(v_state -> 'tournament'),
    'tournamentMatches',
      case
        when jsonb_typeof(v_state -> 'tournamentMatches') = 'array' then v_state -> 'tournamentMatches'
        else '[]'::jsonb
      end,
    'fantaSettings',
      case
        when jsonb_typeof(v_state -> 'fantaSettings') = 'object' then v_state -> 'fantaSettings'
        else null
      end
  );

  if coalesce(jsonb_typeof(v_state -> 'fantaSettings'), '') <> 'object' then
    v_live := v_live - 'fantaSettings';
  end if;

  return v_live;
end;
$$;

revoke all on function public.flbp_build_public_workspace_live_state(jsonb) from public;

create or replace function public.flbp_upsert_public_workspace_live(
  p_workspace_id text,
  p_public_state jsonb,
  p_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_updated_at timestamptz := coalesce(p_updated_at, now());
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  insert into public.public_workspace_live (workspace_id, state, updated_at)
  values (
    v_workspace_id,
    public.flbp_build_public_workspace_live_state(coalesce(p_public_state, '{}'::jsonb)),
    v_updated_at
  )
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.flbp_upsert_public_workspace_live(text, jsonb, timestamptz) from public;

insert into public.public_workspace_live (workspace_id, state, updated_at)
select
  pws.workspace_id,
  public.flbp_build_public_workspace_live_state(pws.state),
  pws.updated_at
from public.public_workspace_state pws
on conflict (workspace_id) do update
set state = excluded.state,
    updated_at = excluded.updated_at;

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

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at);

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean) to authenticated;

create or replace function public.flbp_referee_push_live_state(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_state jsonb;
  v_current_updated_at timestamptz;
  v_tournament_id text;
  v_expected_password text;
  v_auth_version text;
  v_public_state jsonb;
  v_next_updated_at timestamptz := now();
begin
  select ws.state, ws.updated_at
  into v_current_state, v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  for update;

  if v_current_state is null then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'workspace_missing', null);
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'tournament_mismatch', null);
    raise exception 'Torneo live non corrispondente';
  end if;

  v_auth_version := nullif(v_current_state -> 'tournament' ->> 'refereesAuthVersion', '');
  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'no_config', v_auth_version);
    raise exception 'Accesso arbitri non configurato per questo torneo';
  end if;

  if public.flbp_referee_auth_is_rate_limited(p_workspace_id, p_tournament_id) then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'rate_limited', v_auth_version);
    raise exception 'Troppi tentativi arbitri non riusciti: attendi qualche minuto e riprova';
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'bad_password', v_auth_version);
    raise exception 'Password arbitri non valida';
  end if;

  if p_base_updated_at is not null and v_current_updated_at is distinct from p_base_updated_at then
    perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', false, 'conflict', v_auth_version);
    raise exception 'FLBP_DB_CONFLICT: il torneo live e'' stato aggiornato da un altro dispositivo';
  end if;

  v_public_state := coalesce(p_public_state, '{}'::jsonb) #- '{tournament,refereesPassword}';

  update public.workspace_state
  set state = coalesce(p_state, '{}'::jsonb),
      updated_at = v_next_updated_at
  where workspace_id = p_workspace_id;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (p_workspace_id, v_public_state, v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  perform public.flbp_upsert_public_workspace_live(p_workspace_id, v_public_state, v_next_updated_at);

  perform public.flbp_log_referee_auth_audit(p_workspace_id, p_tournament_id, 'push_live_state', true, 'ok', v_auth_version);

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at, 'auth_version', v_auth_version);
end;
$$;

grant execute on function public.flbp_referee_push_live_state(text, text, text, jsonb, jsonb, timestamptz) to anon, authenticated;

create or replace function public.flbp_apply_match_result_patch(
  p_workspace_id text,
  p_tournament_id text,
  p_match_id text,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_tournament_id text := nullif(trim(coalesce(p_tournament_id, '')), '');
  v_match_id text := nullif(trim(coalesce(p_match_id, '')), '');
  v_matches jsonb;
  v_match jsonb;
  v_item_id text;
  v_state jsonb;
  v_public_state jsonb;
  v_current_match jsonb;
  v_current_saved_at timestamptz;
  v_incoming_saved_at timestamptz;
  v_found_primary boolean := false;
  v_next_updated_at timestamptz := now();
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;
  if v_tournament_id is null then
    raise exception 'Torneo live non valido';
  end if;
  if v_match_id is null then
    raise exception 'Match referto non valido';
  end if;

  v_matches := case
    when jsonb_typeof(p_matches) = 'array' then p_matches
    when jsonb_typeof(p_matches) = 'object' then jsonb_build_array(p_matches)
    else '[]'::jsonb
  end;
  if jsonb_array_length(v_matches) = 0 then
    raise exception 'Nessun match nella patch referto';
  end if;

  select ws.state
  into v_state
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if v_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;
  if coalesce(v_state -> 'tournament' ->> 'id', '') <> v_tournament_id then
    raise exception 'Torneo live non corrispondente';
  end if;

  select pws.state
  into v_public_state
  from public.public_workspace_state pws
  where pws.workspace_id = v_workspace_id
  for update;

  if v_public_state is null then
    raise exception 'FLBP_MATCH_RESULT_PUBLIC_SNAPSHOT_STALE: snapshot pubblico non trovato';
  end if;

  for v_match in select elem.value from jsonb_array_elements(v_matches) as elem(value)
  loop
    v_item_id := nullif(trim(coalesce(v_match ->> 'id', '')), '');
    if v_item_id is null then
      raise exception 'Match senza id nella patch referto';
    end if;
    if v_item_id = v_match_id then
      v_found_primary := true;
    end if;

    v_current_match := public.flbp_match_result_find_match(v_state, v_item_id);
    if v_current_match is null then
      raise exception 'Match % non trovato nello snapshot live', v_item_id;
    end if;

    v_current_saved_at := public.flbp_match_result_parse_timestamptz(v_current_match ->> 'refereeReportSavedAt');
    v_incoming_saved_at := public.flbp_match_result_parse_timestamptz(v_match ->> 'refereeReportSavedAt');
    if v_current_saved_at is not null
      and (v_incoming_saved_at is null or v_current_saved_at > v_incoming_saved_at)
    then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene un referto piu'' recente per questa partita'
        using detail = jsonb_build_object('match_id', v_item_id, 'current_match', v_current_match)::text;
    end if;
  end loop;

  if not v_found_primary then
    raise exception 'La patch referto non contiene il match principale %', v_match_id;
  end if;

  for v_match in select elem.value from jsonb_array_elements(v_matches) as elem(value)
  loop
    v_state := public.flbp_match_result_patch_state(v_state, v_match);
    begin
      v_public_state := public.flbp_match_result_patch_state(v_public_state, v_match);
    exception when others then
      raise exception 'FLBP_MATCH_RESULT_PUBLIC_SNAPSHOT_STALE: snapshot pubblico non allineato';
    end;
    perform public.flbp_match_result_upsert_rows(v_workspace_id, v_tournament_id, v_state, v_match, v_next_updated_at);
  end loop;

  update public.workspace_state
  set state = v_state,
      updated_at = v_next_updated_at
  where workspace_id = v_workspace_id;

  update public.public_workspace_state
  set state = v_public_state,
      updated_at = v_next_updated_at
  where workspace_id = v_workspace_id;

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, v_public_state, v_next_updated_at);

  return jsonb_build_object(
    'ok', true,
    'updated_at', v_next_updated_at,
    'matches_count', jsonb_array_length(v_matches)
  );
end;
$$;

revoke all on function public.flbp_apply_match_result_patch(text, text, text, jsonb) from public;
