-- Disposable schema fixture, including the canonical archive transition.
begin;

do $$
declare
  v_workspace constant text := 'fanta-real-team-test';
  v_tournament constant text := 'edition';
  v_state jsonb;
  v_roster_a uuid;
  v_roster_c uuid;
  v_user_a uuid := gen_random_uuid();
  v_user_c uuid := gen_random_uuid();
begin
  insert into public.workspaces(id) values(v_workspace);
  v_state := '{
    "teams":[
      {"id":"a","name":"First team","player1":"Alex Rossi","player2":"Amy"},
      {"id":"b","name":"Second team","player1":"Ben","player2":"Bea"},
      {"id":"c","name":"Third team","player1":"Alex Rossi","player2":"Cathy"}],
    "tournament":{"id":"edition","name":"Fanta test","startDate":"2026-01-01T00:00:00Z","type":"groups_elimination","config":{}},
    "tournamentMatches":[
      {"id":"tb1","code":"ATB1","phase":"groups","groupName":"Girone A","status":"finished","played":true,
       "teamAId":"a","teamBId":"b","scoreA":10,"scoreB":5,"teamIds":["a","b","c"],"scoresByTeam":{"a":10,"b":5,"c":12},
       "stats":[{"teamId":"a","playerName":"Alex Rossi","canestri":2,"soffi":1},
                {"teamId":"c","playerName":"Alex Rossi","canestri":6,"soffi":3}]},
      {"id":"tb2","code":"ATB2","phase":"groups","groupName":"Girone A","status":"finished","played":true,
       "teamAId":"a","teamBId":"b","scoreA":10,"scoreB":5,"teamIds":["a","b","c"],"scoresByTeam":{"a":10,"b":5,"c":10}}],
    "tournamentHistory":[],"hallOfFame":[]}'::jsonb;
  v_state := jsonb_set(v_state, '{tournament,teams}', v_state -> 'teams');
  insert into public.workspace_state(workspace_id,state) values(v_workspace,v_state);
  perform public.flbp_local_sync_live_normalized_internal(v_workspace,v_state);
  insert into auth.users(id,email) values
    (v_user_a,'fanta-real-team-a@example.invalid'), (v_user_c,'fanta-real-team-c@example.invalid');
  insert into public.fanta_teams(workspace_id,tournament_id,user_id,name,status)
    values(v_workspace,v_tournament,v_user_a,'First roster','confirmed') returning id into v_roster_a;
  insert into public.fanta_teams(workspace_id,tournament_id,user_id,name,status)
    values(v_workspace,v_tournament,v_user_c,'Third roster','confirmed') returning id into v_roster_c;
  insert into public.fanta_rosters(team_id,player_id,player_name,real_team_id,real_team_name,role) values
    (v_roster_a,'alex_rossi_ND','Alex Rossi','a','First team','captain'),
    (v_roster_c,'alex_rossi_ND','Alex Rossi','c','Third team','captain');
  insert into public.hall_of_fame_entries(workspace_id,id,year,tournament_id,tournament_name,type,team_name,player_names) values
    (v_workspace,'fanta-real-team-mvp','2026',v_tournament,'Fanta test','mvp','Third team',array['Alex Rossi']),
    (v_workspace,'fanta-real-team-ambiguous','2026',v_tournament,'Fanta test','defender',null,array['Alex Rossi']);

  if not exists (
    select 1 from public.fanta_roster_live_rows
    where team_id = v_roster_a and raw_wins = 0 and raw_goals = 2 and raw_blows = 1 and points_from_awards = 0
  ) or not exists (
    select 1 from public.fanta_roster_live_rows
    where team_id = v_roster_c and raw_wins = 1 and raw_goals = 6 and raw_blows = 3 and points_from_awards = 10
  ) then raise exception 'Fanta points must use the unique three-team winner and the awarded real team'; end if;

  if (select count(distinct player_key) from public.fanta_player_standings where workspace_id = v_workspace) <> 2 then
    raise exception 'Fanta standings merged homonyms from two real teams';
  end if;

  update public.workspace_state
  set state = jsonb_set(jsonb_set(jsonb_set(v_state, '{tournamentHistory}',
    jsonb_build_array((v_state -> 'tournament') || jsonb_build_object('matches', v_state -> 'tournamentMatches'))),
    '{tournament}', 'null'), '{tournamentMatches}', '[]')
  where workspace_id = v_workspace;
  if (select raw_wins from public.fanta_roster_live_rows where team_id = v_roster_c) is distinct from 1 then
    raise exception 'Fanta lost the multi-team result after moving the tournament into history';
  end if;
end;
$$;

rollback;
