-- FLBP Manager Suite - additive referee protected live-state pull RPC
--
-- Goal:
-- - let a referee-authenticated native client read the current full live snapshot
-- - keep the existing web referee auth/push RPCs unchanged
-- - prepare a future native safe-save path without touching the production web flow
--
-- Important:
-- - this migration is additive only
-- - the current web app does not depend on it
-- - apply it only when you are ready to enable the future native path

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
