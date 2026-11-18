-- Referee password: a real attempt limit, and one credential check for every RPC.
--
-- 20260924000300 turned the shared 12-failure threshold into a diagnostic
-- label: a correct password always passed, so an anonymous caller could keep
-- guessing until the answer changed. flbp_referee_cancel_player_calls also
-- compared the password on its own, with no audit and no threshold, so it was
-- an unlimited oracle even before that change.
--
-- Contract after this migration:
-- - below 12 failed comparisons in 10 minutes nothing changes ('bad_password');
-- - from 12 to 29 wrong passwords keep the existing 'rate_limited' label
--   (HTTP 429 on pushes) while a correct password still passes;
-- - from 30 failed comparisons in 10 minutes for the same workspace and
--   tournament every referee attempt is rejected as 'rate_limited' before the
--   password is compared, so a guess no longer reveals anything. These
--   rejections are audited as 'locked' and are not counted: the lock lifts by
--   itself when the failures leave the 10-minute window.
-- Accepted trade-off: whoever keeps sending wrong passwords can keep the
-- referees of that tournament out while the attack lasts (Admin writes are not
-- affected and referee reports stay in the device queue). Per-origin limits
-- need a trusted gateway, which this migration does not simulate.
-- flbp_referee_cancel_player_calls now authenticates through
-- flbp_referee_check_credentials and returns its rejection with a non-2xx
-- status instead of raising, so the audit row commits. Its success result is
-- unchanged (the cancelled call rows).
-- Signatures are unchanged. Safe to reapply.

create or replace function public.flbp_referee_auth_is_locked(p_workspace_id text, p_tournament_id text)
returns boolean
language sql
stable
set search_path = public
as $$
  select count(*) >= 30
  from public.referee_auth_audit a
  where a.workspace_id = nullif(trim(coalesce(p_workspace_id, '')), '')
    and a.tournament_id = nullif(trim(coalesce(p_tournament_id, '')), '')
    and a.ok = false
    and a.reason in ('bad_password', 'rate_limited')
    and a.created_at > now() - interval '10 minutes';
$$;
revoke all on function public.flbp_referee_auth_is_locked(text, text) from public, anon, authenticated;
grant execute on function public.flbp_referee_auth_is_locked(text, text) to service_role;

create or replace function public.flbp_referee_check_credentials(
  p_workspace_id text, p_tournament_id text, p_password text,
  p_action text, p_auth_version text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_state jsonb;
  v_updated_at timestamptz;
  v_password text;
  v_version text;
  v_reason text;
  v_audit_reason text;
begin
  select state, updated_at into v_state, v_updated_at
  from public.workspace_state where workspace_id = p_workspace_id;
  v_password := coalesce(v_state #>> '{tournament,refereesPassword}', '');
  v_version := nullif(v_state #>> '{tournament,refereesAuthVersion}', '');
  if v_state is null then v_reason := 'workspace_missing';
  elsif coalesce(v_state #>> '{tournament,id}', '') = ''
    or (v_state #>> '{tournament,id}') is distinct from p_tournament_id then v_reason := 'tournament_mismatch';
  elsif v_password = '' then v_reason := 'no_config';
  elsif public.flbp_referee_auth_is_locked(p_workspace_id, p_tournament_id) then
    -- Checked before the comparison: while locked, right and wrong passwords
    -- get the same answer. 'locked' rows are not counted by the lock itself.
    v_reason := 'rate_limited';
    v_audit_reason := 'locked';
  elsif v_password <> coalesce(p_password, '') then
    v_reason := case when public.flbp_referee_auth_is_rate_limited(p_workspace_id,p_tournament_id)
      then 'rate_limited' else 'bad_password' end;
  elsif nullif(trim(p_auth_version), '') is not null and v_version is not null
    and trim(p_auth_version) <> v_version then v_reason := 'auth_version_mismatch';
  end if;
  if v_reason is not null then
    perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,p_action,false,coalesce(v_audit_reason,v_reason),null);
    return jsonb_build_object('ok',false,'reason',v_reason);
  end if;
  return jsonb_build_object('ok',true,'auth_version',v_version,'updated_at',v_updated_at,'state',v_state);
end;
$$;
revoke all on function public.flbp_referee_check_credentials(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.flbp_referee_check_credentials(text,text,text,text,text) to service_role;

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
  v_auth jsonb;
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

  v_auth := public.flbp_referee_check_credentials(
    v_workspace_id, v_tournament_id, p_referees_password, 'cancel_player_calls'
  );
  if not coalesce((v_auth->>'ok')::boolean, false) then
    -- Same contract as the referee pushes: a non-2xx response without an
    -- exception, so PostgREST commits the rejection audit.
    perform set_config('response.status', case when v_auth->>'reason' = 'rate_limited' then '429' else '403' end, true);
    return v_auth - 'state';
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
revoke all on function public.flbp_referee_cancel_player_calls(text, text, text, text[], text) from public;
grant execute on function public.flbp_referee_cancel_player_calls(text, text, text, text[], text) to anon, authenticated, service_role;
