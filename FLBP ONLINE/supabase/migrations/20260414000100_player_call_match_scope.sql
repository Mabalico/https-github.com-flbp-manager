drop function if exists public.flbp_player_call_team(text, text, text, text, uuid, text, text);

create or replace function public.flbp_player_call_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_id text,
  p_team_name text default null,
  p_target_user_id uuid default null,
  p_target_player_id text default null,
  p_target_player_name text default null,
  p_match_id text default null
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
  v_match_id text := nullif(trim(coalesce(p_match_id, '')), '');
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
    and status in ('ringing', 'acknowledged')
    and (
      v_match_id is null
      or coalesce(metadata->>'match_id', metadata->>'matchId', '') = v_match_id
      or (not (metadata ? 'match_id') and not (metadata ? 'matchId'))
    );

  insert into public.player_app_calls (
    id, workspace_id, tournament_id, team_id, team_name,
    target_user_id, target_player_id, target_player_name,
    requested_by_user_id, status, requested_at, metadata
  )
  values (
    v_call_id, v_workspace_id, v_tournament_id, v_team_id,
    nullif(trim(coalesce(p_team_name, '')), ''),
    p_target_user_id,
    nullif(trim(coalesce(p_target_player_id, '')), ''),
    nullif(trim(coalesce(p_target_player_name, '')), ''),
    auth.uid(),
    'ringing',
    v_requested_at,
    case
      when v_match_id is null then '{}'::jsonb
      else jsonb_build_object('match_id', v_match_id)
    end
  );

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'status', 'ringing',
    'requested_at', v_requested_at,
    'match_id', v_match_id
  );
end;
$$;

grant execute on function public.flbp_player_call_team(text, text, text, text, uuid, text, text, text) to authenticated;

create or replace function public.flbp_referee_cancel_player_calls(
  p_workspace_id text,
  p_tournament_id text,
  p_referees_password text,
  p_team_ids text[] default null,
  p_match_id text default null
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
  v_team_ids text[] := '{}'::text[];
  v_current_state jsonb;
  v_live_tournament_id text;
  v_expected_password text;
  v_cancelled_at timestamptz := now();
  v_rows jsonb := '[]'::jsonb;
begin
  if v_workspace_id is null or v_tournament_id is null then
    raise exception 'Parametri convocazione non validi';
  end if;

  select coalesce(array_agg(team_id), '{}'::text[])
  into v_team_ids
  from (
    select nullif(trim(value), '') as team_id
    from unnest(coalesce(p_team_ids, '{}'::text[])) as value
  ) normalized
  where team_id is not null;

  if v_match_id is null and cardinality(v_team_ids) = 0 then
    raise exception 'Parametri convocazione non validi';
  end if;

  select ws.state
  into v_current_state
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  limit 1;

  if v_current_state is null then
    raise exception 'Workspace snapshot non trovato';
  end if;

  v_live_tournament_id := coalesce(v_current_state -> 'tournament' ->> 'id', '');
  if v_live_tournament_id = '' or v_live_tournament_id <> v_tournament_id then
    raise exception 'Torneo live non corrispondente';
  end if;

  v_expected_password := coalesce(v_current_state -> 'tournament' ->> 'refereesPassword', '');
  if v_expected_password = '' or v_expected_password <> coalesce(p_referees_password, '') then
    raise exception 'Password arbitri non valida';
  end if;

  with cancelled as (
    update public.player_app_calls
    set status = 'cancelled',
        cancelled_at = v_cancelled_at
    where workspace_id = v_workspace_id
      and tournament_id = v_tournament_id
      and status in ('ringing', 'acknowledged')
      and (cardinality(v_team_ids) = 0 or team_id = any(v_team_ids))
      and (
        v_match_id is null
        or coalesce(metadata->>'match_id', metadata->>'matchId', '') = v_match_id
        or (not (metadata ? 'match_id') and not (metadata ? 'matchId'))
      )
    returning id, workspace_id, tournament_id, team_id, team_name,
      target_user_id, target_player_id, target_player_name, requested_by_user_id,
      status, requested_at, acknowledged_at, cancelled_at, metadata
  )
  select coalesce(jsonb_agg(to_jsonb(cancelled) order by requested_at desc), '[]'::jsonb)
  into v_rows
  from cancelled;

  return v_rows;
end;
$$;

grant execute on function public.flbp_referee_cancel_player_calls(text, text, text, text[], text) to anon, authenticated;
