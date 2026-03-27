-- FLBP Manager - Referee auth/write RPCs
--
-- Goal:
-- - let referee devices authenticate and submit live reports without an admin JWT
-- - keep full DB write access admin-only everywhere else
-- - validate via the live tournament refereesPassword already configured in the app

create or replace function public.flbp_referee_auth_check(
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
    'updated_at', v_updated_at
  );
end;
$$;

grant execute on function public.flbp_referee_auth_check(text, text, text) to anon, authenticated;

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
  v_next_updated_at timestamptz := now();
begin
  select ws.state, ws.updated_at
  into v_current_state, v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = p_workspace_id
  for update;

  if v_current_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_tournament_id = '' or v_tournament_id <> coalesce(p_tournament_id, '') then
    raise exception 'Torneo live non corrispondente';
  end if;

  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' then
    raise exception 'Accesso arbitri non configurato per questo torneo';
  end if;

  if v_expected_password <> coalesce(p_referees_password, '') then
    raise exception 'Password arbitri non valida';
  end if;

  if p_base_updated_at is not null and v_current_updated_at is distinct from p_base_updated_at then
    raise exception 'FLBP_DB_CONFLICT: il torneo live è stato aggiornato da un altro dispositivo';
  end if;

  update public.workspace_state
  set state = coalesce(p_state, '{}'::jsonb),
      updated_at = v_next_updated_at
  where workspace_id = p_workspace_id;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (p_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_referee_push_live_state(text, text, text, jsonb, jsonb, timestamptz) to anon, authenticated;
