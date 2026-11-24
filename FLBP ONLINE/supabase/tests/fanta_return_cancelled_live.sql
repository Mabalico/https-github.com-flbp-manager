-- Disposable schema fixture: "Annulla torneo live" hands Fanta back to the
-- pre-tournament without losing a roster. Every change is rolled back.
begin;

do $$
declare
  v_workspace constant text := 'fanta-cancel-live-test';
  v_admin uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_live jsonb;
  v_result jsonb;
  v_team_a uuid;
  v_team_b uuid;
  v_message text;
begin
  insert into public.workspaces(id) values (v_workspace);
  insert into auth.users(id, email) values
    (v_admin, 'cancel-admin@example.invalid'),
    (v_user_a, 'cancel-a@example.invalid'),
    (v_user_b, 'cancel-b@example.invalid');
  insert into public.admin_users(user_id, email) values (v_admin, 'cancel-admin@example.invalid');

  v_live := '{
    "teams":[
      {"id":"a","name":"First team","player1":"Alex One","player2":"Amy Two","createdAt":1767225600000},
      {"id":"b","name":"Second team","player1":"Ben One","player2":"Bea Two","createdAt":1767225600000}],
    "tournament":{"id":"live-1","name":"Cancelled live","startDate":"2026-01-01T00:00:00Z","type":"elimination","config":{}},
    "tournamentMatches":[
      {"id":"m1","code":"A1","phase":"bracket","round":1,"status":"finished","played":true,
       "teamAId":"a","teamBId":"b","scoreA":10,"scoreB":5,
       "stats":[{"teamId":"a","playerName":"Alex One","canestri":10,"soffi":1}]}],
    "tournamentHistory":[],"hallOfFame":[]}'::jsonb;
  v_live := jsonb_set(v_live, '{tournament,teams}', v_live -> 'teams');
  insert into public.workspace_state(workspace_id, state) values (v_workspace, v_live);
  perform public.flbp_local_sync_live_normalized_internal(v_workspace, v_live);

  insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
    values (v_workspace, 'live-1', v_user_a, 'Promoted roster', 'confirmed') returning id into v_team_a;
  insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
    values (v_workspace, 'live-1', v_user_b, 'Older roster', 'confirmed') returning id into v_team_b;
  insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
    values (v_workspace, '__pre_tournament__', v_user_b, 'New pre-tournament roster', 'confirmed');
  insert into public.fanta_rosters(team_id, player_id, player_name, real_team_id, real_team_name, role)
    values (v_team_a, 'alex_one_ND', 'Alex One', 'a', 'First team', 'captain');
  insert into public.fanta_config(workspace_id, active_tournament_id, is_lock_active, registration_open)
    values (v_workspace, 'live-1', true, false)
    on conflict (workspace_id) do update set active_tournament_id = excluded.active_tournament_id, is_lock_active = true, registration_open = false;

  -- A player cannot run it.
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_user_a)::text, true);
  begin
    perform public.fanta_return_cancelled_live(v_workspace, 'live-1');
    raise exception 'TEST: a player could cancel the Fanta phase';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message like 'TEST:%' or v_message not like 'Accesso admin richiesto%' then raise exception '%', v_message; end if;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, true);

  -- Refused while the tournament is live: nothing moves.
  begin
    perform public.fanta_return_cancelled_live(v_workspace, 'live-1');
    raise exception 'TEST: a live tournament was treated as cancelled';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message not like 'FLBP_TOURNAMENT_STILL_LIVE%' then raise exception '%', v_message; end if;
  end;
  if (select count(*) from public.fanta_teams where workspace_id = v_workspace and tournament_id = 'live-1') <> 2 then
    raise exception 'TEST: a refused call changed the rosters';
  end if;

  -- The container itself can never be emptied through this function.
  begin
    perform public.fanta_return_cancelled_live(v_workspace, '__pre_tournament__');
    raise exception 'TEST: the pre-tournament container was accepted';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message like 'TEST:%' then raise exception '%', v_message; end if;
  end;

  -- Cancelled: snapshot without tournament, then the Fanta hand-back.
  update public.workspace_state
  set state = jsonb_set(jsonb_set(v_live, '{tournament}', 'null'), '{tournamentMatches}', '[]')
  where workspace_id = v_workspace;
  v_result := public.fanta_return_cancelled_live(v_workspace, 'live-1');
  if v_result <> '{"ok": true, "returned": 1, "kept": 1}'::jsonb then
    raise exception 'TEST: unexpected result %', v_result;
  end if;
  if (select tournament_id from public.fanta_teams where id = v_team_a) <> '__pre_tournament__'
    or (select count(*) from public.fanta_rosters where team_id = v_team_a) <> 1 then
    raise exception 'TEST: the promoted roster did not return intact to the pre-tournament';
  end if;
  if (select tournament_id from public.fanta_teams where id = v_team_b) <> 'live-1'
    or (select count(*) from public.fanta_teams where workspace_id = v_workspace) <> 3 then
    raise exception 'TEST: a roster was lost or overwrote a newer pre-tournament one';
  end if;
  if not exists (
    select 1 from public.fanta_config
    where workspace_id = v_workspace and active_tournament_id = '__pre_tournament__'
      and is_lock_active = false and registration_open = true
  ) then raise exception 'TEST: fanta_config still points at the cancelled tournament'; end if;
  if exists (select 1 from public.tournaments where workspace_id = v_workspace and id = 'live-1')
    or exists (select 1 from public.public_tournaments where workspace_id = v_workspace and id = 'live-1')
    or exists (select 1 from public.tournament_matches where workspace_id = v_workspace and tournament_id = 'live-1')
    or exists (select 1 from public.public_tournament_matches where workspace_id = v_workspace and tournament_id = 'live-1')
    or exists (select 1 from public.tournament_match_stats where workspace_id = v_workspace and tournament_id = 'live-1')
  then raise exception 'TEST: live rows of the cancelled tournament are still readable'; end if;

  -- Repeating it is harmless.
  v_result := public.fanta_return_cancelled_live(v_workspace, 'live-1');
  if v_result <> '{"ok": true, "returned": 0, "kept": 1}'::jsonb then
    raise exception 'TEST: a repeated call changed something: %', v_result;
  end if;

  -- A tournament started in the meantime keeps its Fanta phase.
  update public.workspace_state set state = jsonb_set(v_live, '{tournament,id}', '"live-2"') where workspace_id = v_workspace;
  update public.fanta_config set active_tournament_id = 'live-2' where workspace_id = v_workspace;
  perform public.fanta_return_cancelled_live(v_workspace, 'live-1');
  if (select active_tournament_id from public.fanta_config where workspace_id = v_workspace) <> 'live-2' then
    raise exception 'TEST: the phase of a newer live tournament was reset';
  end if;

  -- An archived tournament is never treated as cancelled.
  update public.workspace_state
  set state = jsonb_set(jsonb_set(v_live, '{tournament}', 'null'), '{tournamentHistory}', jsonb_build_array(v_live -> 'tournament'))
  where workspace_id = v_workspace;
  begin
    perform public.fanta_return_cancelled_live(v_workspace, 'live-1');
    raise exception 'TEST: an archived tournament was treated as cancelled';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message not like 'FLBP_TOURNAMENT_ARCHIVED%' then raise exception '%', v_message; end if;
  end;

  -- In local mode the public projection is authoritative, not the older snapshot.
  update public.workspace_state set state = v_live where workspace_id = v_workspace;
  insert into public.flbp_data_plane(workspace_id, mode, node_id, base_url, epoch, lease_expires_at)
    values (v_workspace, 'local', 'node', 'http://127.0.0.1:8787', 1, now() + interval '5 minutes')
    on conflict (workspace_id) do update set mode = 'local', node_id = 'node', base_url = excluded.base_url, lease_expires_at = excluded.lease_expires_at;
  perform set_config('flbp.local_backup_context', v_workspace || ':node:' || (
    select epoch::text from public.flbp_data_plane where workspace_id = v_workspace), true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.public_workspace_live(workspace_id, state) values (v_workspace, v_live)
    on conflict (workspace_id) do update set state = excluded.state;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  begin
    perform public.fanta_return_cancelled_live(v_workspace, 'live-1');
    raise exception 'TEST: local mode ignored the published live tournament';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message not like 'FLBP_TOURNAMENT_STILL_LIVE%' then raise exception '%', v_message; end if;
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.public_workspace_live set state = jsonb_set(v_live, '{tournament}', 'null') where workspace_id = v_workspace;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  v_result := public.fanta_return_cancelled_live(v_workspace, 'live-1');
  if v_result ->> 'ok' <> 'true' then raise exception 'TEST: local mode hand-back failed'; end if;

  if has_function_privilege('anon', 'public.fanta_return_cancelled_live(text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.fanta_return_cancelled_live(text,text)', 'EXECUTE')
  then raise exception 'TEST: wrong privileges on fanta_return_cancelled_live'; end if;
end;
$$;

select 'PASS: cancelled live returns Fanta to the pre-tournament without losing rosters' as result;

rollback;
