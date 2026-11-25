-- Disposable schema fixture: the Admin deletes the Fanta edition of one archived
-- tournament and nothing else. Every change is rolled back.
begin;

do $$
declare
  v_workspace constant text := 'fanta-delete-edition-test';
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_id text;
  v_team uuid;
  v_result jsonb;
  v_message text;
begin
  insert into public.workspaces(id) values (v_workspace);
  insert into auth.users(id, email) values
    (v_admin, 'delete-admin@example.invalid'),
    (v_user, 'delete-player@example.invalid');
  insert into public.admin_users(user_id, email) values (v_admin, 'delete-admin@example.invalid');

  foreach v_id in array array['trial', 'real', '__pre_tournament__'] loop
    if v_id <> '__pre_tournament__' then
      insert into public.tournaments(workspace_id, id, name, start_date, type, config)
        values (v_workspace, v_id, 'Tournament ' || v_id, '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb);
      insert into public.public_tournaments(workspace_id, id, name, start_date, type, config, status)
        values (v_workspace, v_id, 'Tournament ' || v_id, '2026-08-01T00:00:00Z', 'elimination', '{}'::jsonb, 'archived');
    end if;
    insert into public.fanta_teams(workspace_id, tournament_id, user_id, name, status)
      values (v_workspace, v_id, v_user, 'Roster ' || v_id, 'confirmed') returning id into v_team;
    insert into public.fanta_rosters(team_id, player_id, player_name, real_team_id, real_team_name, role)
      values (v_team, 'alex_one_ND', 'Alex One', 'a', 'First team', 'captain');
    if v_id <> '__pre_tournament__' then
      insert into public.fanta_archived_editions(workspace_id, tournament_id, tournament_name, teams_count)
        values (v_workspace, v_id, 'Tournament ' || v_id, 1);
      insert into public.fanta_archived_standings(workspace_id, tournament_id, team_id, rank, team_name)
        values (v_workspace, v_id, v_team, 1, 'Roster ' || v_id);
      insert into public.fanta_archived_players(workspace_id, tournament_id, player_id, rank, player_name)
        values (v_workspace, v_id, 'alex_one_ND', 1, 'Alex One');
      insert into public.fanta_archived_rosters(workspace_id, tournament_id, team_id, team_name, player_id, player_name)
        values (v_workspace, v_id, v_team, 'Roster ' || v_id, 'alex_one_ND', 'Alex One');
    end if;
  end loop;

  -- A player cannot run it.
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_user)::text, true);
  begin
    perform public.flbp_admin_delete_fanta_tournament_data(v_workspace, 'trial');
    raise exception 'TEST: a player could delete a Fanta edition';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message like 'TEST:%' or v_message not like 'Accesso admin richiesto%' then raise exception '%', v_message; end if;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  v_result := public.flbp_admin_delete_fanta_tournament_data(v_workspace, 'trial');
  if (v_result ->> 'deleted_teams')::int <> 1 or (v_result ->> 'deleted_rosters')::int <> 1 then
    raise exception 'TEST: wrong counts %', v_result;
  end if;

  if exists (select 1 from public.fanta_teams where workspace_id = v_workspace and tournament_id = 'trial')
    or exists (select 1 from public.fanta_archived_editions where workspace_id = v_workspace and tournament_id = 'trial')
    or exists (select 1 from public.fanta_archived_standings where workspace_id = v_workspace and tournament_id = 'trial')
    or exists (select 1 from public.fanta_archived_players where workspace_id = v_workspace and tournament_id = 'trial')
    or exists (select 1 from public.fanta_archived_rosters where workspace_id = v_workspace and tournament_id = 'trial')
  then raise exception 'TEST: Fanta rows left behind'; end if;

  -- The tournament, the other edition and the pre-tournament rosters are untouched.
  if (select count(*) from public.tournaments where workspace_id = v_workspace and id in ('trial', 'real')) <> 2
    or (select count(*) from public.public_tournaments where workspace_id = v_workspace and id in ('trial', 'real')) <> 2
    or (select count(*) from public.fanta_teams where workspace_id = v_workspace) <> 2
    or (select count(*) from public.fanta_rosters r join public.fanta_teams f on f.id = r.team_id where f.workspace_id = v_workspace) <> 2
    or (select count(*) from public.fanta_archived_editions where workspace_id = v_workspace) <> 1
    or (select count(*) from public.fanta_archived_rosters where workspace_id = v_workspace and tournament_id = 'real') <> 1
  then raise exception 'TEST: something else was deleted'; end if;

  -- Renaming or publishing the tournament again does not bring the edition back.
  perform public.flbp_archive_fanta_tournament(v_workspace, 'trial');
  if exists (select 1 from public.fanta_archived_editions where workspace_id = v_workspace and tournament_id = 'trial') then
    raise exception 'TEST: the deleted edition came back';
  end if;

  if has_function_privilege('anon', 'public.flbp_admin_delete_fanta_tournament_data(text,text)', 'EXECUTE') then
    raise exception 'TEST: anon can delete Fanta data';
  end if;
end;
$$;

select 'PASS: the Admin deletes one Fanta edition and nothing else' as result;

rollback;
