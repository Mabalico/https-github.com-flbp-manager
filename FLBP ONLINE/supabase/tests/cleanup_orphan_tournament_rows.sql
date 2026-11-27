-- Disposable schema fixture: only tournament rows that nothing uses any more
-- are removed. Every change is rolled back.
begin;

do $$
declare
  v_workspace constant text := 'orphan-tournament-cleanup-test';
  v_user uuid := gen_random_uuid();
  v_old constant timestamptz := now() - interval '3 days';
  v_removed integer;
  v_id text;
begin
  insert into public.workspaces(id) values (v_workspace);
  insert into auth.users(id, email) values (v_user, 'cleanup-player@example.invalid');
  insert into public.workspace_state(workspace_id, state) values (v_workspace, jsonb_build_object(
    'tournament', jsonb_build_object('id', 'live'),
    'tournamentHistory', jsonb_build_array(jsonb_build_object('id', 'history'))
  ));

  foreach v_id in array array['live', 'history', 'published', 'with-team', 'with-match', 'with-fanta', 'orphan', 'orphan-recent'] loop
    insert into public.tournaments(workspace_id, id, name, start_date, type, config, created_at, updated_at)
      values (v_workspace, v_id, 'Tournament ' || v_id, '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb,
        case when v_id = 'orphan-recent' then now() else v_old end,
        case when v_id = 'orphan-recent' then now() else v_old end);
  end loop;
  insert into public.public_tournaments(workspace_id, id, name, start_date, type, config, status)
    values (v_workspace, 'published', 'Tournament published', '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb, 'archived');
  insert into public.tournament_teams(workspace_id, tournament_id, id, name, player1, player2)
    values (v_workspace, 'with-team', 'a', 'Team A', 'Alex One', 'Amy Two');
  insert into public.tournament_matches(workspace_id, tournament_id, id, code, phase, status, played, score_a, score_b)
    values (v_workspace, 'with-match', 'm1', 'A1', 'groups', 'scheduled', false, 0, 0);
  insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
    values (v_workspace, 'with-fanta', v_user, 'Roster', 'confirmed');

  v_removed := public.flbp_cleanup_orphan_tournament_rows(v_workspace);
  if v_removed <> 1 then raise exception 'TEST: expected one removed row, got %', v_removed; end if;
  if exists (select 1 from public.tournaments where workspace_id = v_workspace and id = 'orphan') then
    raise exception 'TEST: the unused row is still there';
  end if;
  if (select count(*) from public.tournaments where workspace_id = v_workspace) <> 7 then
    raise exception 'TEST: a row in use was removed';
  end if;
  if (select count(*) from public.tournaments where workspace_id = v_workspace and id = '__pre_tournament__') > 0 then
    raise exception 'TEST: unexpected pre-tournament row in the fixture';
  end if;

  -- Running it again changes nothing.
  if public.flbp_cleanup_orphan_tournament_rows(v_workspace) <> 0 then raise exception 'TEST: the cleanup is not repeatable'; end if;
  -- Without a workspace state nothing is removed.
  if public.flbp_cleanup_orphan_tournament_rows('missing-workspace') <> 0 then raise exception 'TEST: a workspace without state was cleaned'; end if;

  if has_function_privilege('anon', 'public.flbp_cleanup_orphan_tournament_rows(text,interval)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.flbp_cleanup_orphan_tournament_rows(text,interval)', 'EXECUTE')
  then raise exception 'TEST: the cleanup must not be callable from the site'; end if;
end;
$$;

select 'PASS: only unused tournament rows are removed' as result;

rollback;
