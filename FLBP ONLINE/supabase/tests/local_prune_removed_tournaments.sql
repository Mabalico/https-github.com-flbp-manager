-- Disposable schema fixture: in local mode the rebuild of the normalized
-- tables removes the rows of tournaments that left the state, private and
-- public, keeping the pre-tournament container and rows that hold Fanta teams.
-- Every change is rolled back.
begin;

create or replace function pg_temp.seed_tournament(p_ws text, p_id text, p_status text)
returns void language plpgsql as $$
begin
  insert into public.tournaments(workspace_id, id, name, start_date, type, config, status)
    values (p_ws, p_id, 'Tournament ' || p_id, '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb, p_status);
  insert into public.public_tournaments(workspace_id, id, name, start_date, type, config, status)
    values (p_ws, p_id, 'Tournament ' || p_id, '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb, p_status);
  insert into public.tournament_teams(workspace_id, tournament_id, id, name, player1, player2)
    values (p_ws, p_id, 'a', 'Team A', 'Alex One', 'Amy Two');
  insert into public.tournament_matches(workspace_id, tournament_id, id, code, phase, status, played, score_a, score_b)
    values (p_ws, p_id, 'm1', 'A1', 'groups', 'scheduled', false, 0, 0);
end;
$$;

do $$
declare
  v_ws constant text := 'local-prune-test';
  v_user uuid := gen_random_uuid();
  v_state jsonb := jsonb_build_object(
    'tournament', null,
    'tournamentHistory', jsonb_build_array(jsonb_build_object(
      'id', 'archived', 'name', 'Tournament archived', 'startDate', '2026-08-01',
      'type', 'elimination', 'teams', '[]'::jsonb, 'matches', '[]'::jsonb
    ))
  );
  v_result jsonb;
begin
  insert into public.workspaces(id) values (v_ws);
  insert into auth.users(id, email) values (v_user, 'prune-player@example.invalid');
  insert into public.workspace_state(workspace_id, state, version) values (v_ws, v_state, 1);

  insert into public.tournaments(workspace_id, id, name, start_date, type, config, status)
    values (v_ws, '__pre_tournament__', 'Pretorneo', '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb, 'live');
  perform pg_temp.seed_tournament(v_ws, 'archived', 'archived');
  perform pg_temp.seed_tournament(v_ws, 'deleted', 'archived');
  perform pg_temp.seed_tournament(v_ws, 'cancelled', 'live');
  perform pg_temp.seed_tournament(v_ws, 'cancelled-fanta', 'live');
  insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
    values (v_ws, 'cancelled-fanta', v_user, 'Roster', 'confirmed');

  -- A state that cannot tell tournaments apart removes nothing.
  v_result := public.flbp_local_prune_tournaments_outside_state_internal(v_ws, '{}'::jsonb);
  if v_result ->> 'skipped' is distinct from 'no_history' then raise exception 'TEST: missing history not skipped: %', v_result; end if;
  v_result := public.flbp_local_prune_tournaments_outside_state_internal(v_ws, '{"tournament": null, "tournamentHistory": []}'::jsonb);
  if v_result ->> 'skipped' is distinct from 'no_tournaments' then raise exception 'TEST: empty state not skipped: %', v_result; end if;
  if (select count(*) from public.tournaments where workspace_id = v_ws) <> 5 then raise exception 'TEST: a skipped prune removed rows'; end if;

  -- Full rebuild (archive, history change, last rebuild before the return to cloud).
  v_result := public.flbp_local_sync_full_normalized_internal(v_ws, v_state);
  if v_result #>> '{pruned,tournaments}' is distinct from '2'
    or v_result #>> '{pruned,public_tournaments}' is distinct from '3'
    or v_result #>> '{pruned,kept_with_fanta}' is distinct from '1'
  then raise exception 'TEST: unexpected full rebuild prune: %', v_result -> 'pruned'; end if;
  if exists (select 1 from public.tournaments where workspace_id = v_ws and id in ('deleted', 'cancelled')) then
    raise exception 'TEST: a removed tournament kept its private row';
  end if;
  if exists (select 1 from public.public_tournaments where workspace_id = v_ws and id in ('deleted', 'cancelled', 'cancelled-fanta')) then
    raise exception 'TEST: a removed tournament kept its public row';
  end if;
  if exists (select 1 from public.tournament_teams where workspace_id = v_ws and tournament_id in ('deleted', 'cancelled'))
    or exists (select 1 from public.tournament_matches where workspace_id = v_ws and tournament_id in ('deleted', 'cancelled'))
  then raise exception 'TEST: children of a removed tournament are still there'; end if;
  if (select count(*) from public.tournaments where workspace_id = v_ws and id in ('__pre_tournament__', 'archived', 'cancelled-fanta')) <> 3
    or not exists (select 1 from public.public_tournaments where workspace_id = v_ws and id = 'archived')
    or (select count(*) from public.fanta_teams where workspace_id = v_ws) <> 1
  then raise exception 'TEST: a kept tournament or a Fanta team was removed'; end if;

  -- Live rebuild from the local journal: a cancelled live tournament.
  perform pg_temp.seed_tournament(v_ws, 'cancelled', 'live');
  insert into public.flbp_data_plane(workspace_id, mode, node_id, base_url, epoch, lease_expires_at)
    values (v_ws, 'local', 'node-test', 'https://node.invalid', 1, now() + interval '1 hour');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.flbp_local_append_operations_v2(v_ws, 'node-test', 1,
    jsonb_build_array(jsonb_build_object(
      'operation_id', 'op-cancel-live', 'local_version', 2, 'operation_kind', 'state-patch',
      'payload', jsonb_build_object('statePatch', jsonb_build_array(jsonb_build_object(
        'op', 'replace', 'path', jsonb_build_array('tournament'), 'value', null))),
      'created_at', now()
    )),
    v_state);
  perform set_config('request.jwt.claims', '', true);
  if v_result ->> 'normalized_mode' is distinct from 'live'
    or v_result #>> '{normalized_pruned,tournaments}' is distinct from '1'
  then raise exception 'TEST: the live rebuild did not prune: %', v_result; end if;
  if exists (select 1 from public.tournaments where workspace_id = v_ws and id = 'cancelled')
    or exists (select 1 from public.public_tournaments where workspace_id = v_ws and id = 'cancelled')
  then raise exception 'TEST: the cancelled live tournament kept its rows'; end if;

  -- Running the rebuild again changes nothing.
  v_result := public.flbp_local_prune_tournaments_outside_state_internal(v_ws, v_state);
  if v_result ->> 'tournaments' <> '0' or v_result ->> 'public_tournaments' <> '0' then
    raise exception 'TEST: the prune is not repeatable: %', v_result;
  end if;

  if has_function_privilege('anon', 'public.flbp_local_prune_tournaments_outside_state_internal(text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.flbp_local_prune_tournaments_outside_state_internal(text,jsonb)', 'EXECUTE')
  then raise exception 'TEST: the prune must not be callable from the site'; end if;
end;
$$;

select 'PASS: local rebuilds remove the rows of tournaments that left the state' as result;

rollback;
