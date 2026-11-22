-- Report saves that create the tie-break they make necessary: a group TB or
-- the final-group FTB, between two or more teams, from the Admin and from the
-- referee entrypoints. Disposable PostgreSQL only: real entrypoints, roles and
-- privileges; every fixture rolls back.
begin;
create schema tiebreak_test;
grant usage on schema tiebreak_test to anon, authenticated;
create table tiebreak_test.checks(label text);
grant insert on tiebreak_test.checks to anon, authenticated;
create function tiebreak_test.check(p_ok boolean, p_label text) returns text language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Tie-break assertion failed: %', p_label; end if;
  insert into tiebreak_test.checks values (p_label);
  return 'PASS: ' || p_label;
end;
$$;

-- Group C: five results saved, C18 still to play. Group D is not finished.
-- "Girone 1" was renamed by the Admin: the app numbers its tie-breaks 1TB<n>.
create function tiebreak_test.install(p_workspace text) returns void language plpgsql as $$
declare v_state jsonb;
begin
  v_state := $fixture${
    "teams": [{"id":"c1","name":"C1"},{"id":"c2","name":"C2"},{"id":"c3","name":"C3"},{"id":"c4","name":"C4"},
      {"id":"d1","name":"D1"},{"id":"d2","name":"D2"},{"id":"u1","name":"U1"},{"id":"u2","name":"U2"}],
    "tournament": {"id":"tb-test","name":"Spareggi","type":"groups_elimination",
      "refereesPassword":"fixture-only-secret","refereesAuthVersion":"v1",
      "config":{"finalRoundRobin":{"enabled":true,"activated":true,"topTeams":3}},
      "groups":[
        {"name":"Girone C","teams":[{"id":"c1"},{"id":"c2"},{"id":"c3"},{"id":"c4"}]},
        {"name":"Girone D","teams":[{"id":"d1"},{"id":"d2"}]},
        {"name":"Girone 1","teams":[{"id":"u1"},{"id":"u2"}]},
        {"name":"Girone Finale","stage":"final","teams":[{"id":"c1"},{"id":"c2"},{"id":"c3"}]}]},
    "tournamentMatches": [
      {"id":"c13","code":"C13","phase":"groups","groupName":"Girone C","teamAId":"c1","teamBId":"c2","scoreA":10,"scoreB":8,"played":true,"status":"finished","orderIndex":1},
      {"id":"c14","code":"C14","phase":"groups","groupName":"Girone C","teamAId":"c1","teamBId":"c3","scoreA":8,"scoreB":10,"played":true,"status":"finished","orderIndex":2},
      {"id":"c15","code":"C15","phase":"groups","groupName":"Girone C","teamAId":"c1","teamBId":"c4","scoreA":10,"scoreB":5,"played":true,"status":"finished","orderIndex":3},
      {"id":"c16","code":"C16","phase":"groups","groupName":"Girone C","teamAId":"c2","teamBId":"c3","scoreA":10,"scoreB":8,"played":true,"status":"finished","orderIndex":4},
      {"id":"c17","code":"C17","phase":"groups","groupName":"Girone C","teamAId":"c2","teamBId":"c4","scoreA":10,"scoreB":5,"played":true,"status":"finished","orderIndex":5},
      {"id":"c18","code":"C18","phase":"groups","groupName":"Girone C","teamAId":"c3","teamBId":"c4","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","orderIndex":6},
      {"id":"d19","code":"D19","phase":"groups","groupName":"Girone D","teamAId":"d1","teamBId":"d2","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","orderIndex":7},
      {"id":"u20","code":"U20","phase":"groups","groupName":"Girone 1","teamAId":"u1","teamBId":"u2","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","orderIndex":8},
      {"id":"f1","code":"F1","phase":"groups","groupName":"Girone Finale","teamAId":"c1","teamBId":"c2","scoreA":10,"scoreB":8,"played":true,"status":"finished","orderIndex":9},
      {"id":"f2","code":"F2","phase":"groups","groupName":"Girone Finale","teamAId":"c1","teamBId":"c3","scoreA":8,"scoreB":10,"played":true,"status":"finished","orderIndex":10},
      {"id":"f3","code":"F3","phase":"groups","groupName":"Girone Finale","teamAId":"c2","teamBId":"c3","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","orderIndex":11}]
  }$fixture$::jsonb;
  v_state := jsonb_set(v_state, '{tournament,matches}', v_state -> 'tournamentMatches');
  insert into public.workspaces(id) values (p_workspace);
  insert into public.workspace_state(workspace_id, state, updated_at) values (p_workspace, v_state, '2026-11-01T00:00:00Z');
  insert into public.public_workspace_state(workspace_id, state, updated_at)
    values (p_workspace, v_state #- '{tournament,refereesPassword}', '2026-11-01T00:00:00Z');
end;
$$;

-- A finished result of an existing fixture match. The fixture readers run as
-- their owner: client roles cannot read workspace_state themselves.
create function tiebreak_test.result(p_workspace text, p_id text, p_score_a int, p_score_b int, p_saved_at text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select m.value || jsonb_build_object('scoreA', p_score_a, 'scoreB', p_score_b, 'played', true,
    'status', 'finished', 'refereeReportSavedAt', p_saved_at)
  from public.workspace_state ws, jsonb_array_elements(ws.state -> 'tournamentMatches') as m(value)
  where ws.workspace_id = p_workspace and m.value ->> 'id' = p_id;
$$;

create function tiebreak_test.tiebreak(p_id text, p_code text, p_group text, p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'code', p_code, 'phase', 'groups', 'groupName', p_group,
    'scoreA', 0, 'scoreB', 0, 'played', false, 'status', 'scheduled', 'isTieBreak', true, 'targetScore', 1) || p_extra;
$$;

create function tiebreak_test.match(p_workspace text, p_id text) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select m.value from public.workspace_state ws, jsonb_array_elements(ws.state -> 'tournamentMatches') as m(value)
  where ws.workspace_id = p_workspace and m.value ->> 'id' = p_id;
$$;

-- True when the Admin save is refused with this message and changes nothing.
create function tiebreak_test.admin_refuses(p_workspace text, p_match_id text, p_patch jsonb, p_message text)
returns boolean language plpgsql as $$
begin
  perform public.flbp_admin_push_match_result(p_workspace, 'tb-test', p_match_id, p_patch, null);
  return false;
exception when others then
  if strpos(sqlerrm, p_message) = 0 then raise; end if;
  return true;
end;
$$;

select tiebreak_test.install('tb-admin-test');
select tiebreak_test.install('tb-referee-test');

select tiebreak_test.check(
  not has_function_privilege('anon', 'public.flbp_report_validate_new_tiebreak(jsonb,jsonb,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.flbp_report_validate_new_tiebreak(jsonb,jsonb,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.flbp_report_append_new_matches(jsonb,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.flbp_report_append_new_matches(jsonb,jsonb)', 'EXECUTE'),
  'client roles cannot call the tie-break helpers directly');

-- Admin entrypoint.
select set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
do $$
declare v_out jsonb; v_last jsonb;
begin
  v_last := tiebreak_test.result('tb-admin-test', 'c18', 8, 10, '2026-11-22T10:00:00Z');
  v_out := public.flbp_admin_push_match_result('tb-admin-test', 'tb-test', 'c18', jsonb_build_array(v_last,
    tiebreak_test.tiebreak('tb-c-1', 'CTB1', 'Girone C', '{"teamIds":["c1","c2","c3"],"scoresByTeam":{"c1":0,"c2":0,"c3":0},"orderIndex":12,"injectedField":"not stored"}')), null);
  perform tiebreak_test.check(v_out ->> 'ok' = 'true' and v_out ->> 'created_matches' = '1',
    'Admin: the last group result creates the three-team tie-break in the same save');

  perform tiebreak_test.check(tiebreak_test.admin_refuses('tb-admin-test', 'c18', jsonb_build_array(
      v_last || '{"refereeReportSavedAt":"2026-11-22T10:01:00Z"}',
      tiebreak_test.tiebreak('tb-c-2', 'CTB2', 'Girone C', '{"teamIds":["c1","c2","c3"]}')),
    'c''è già uno spareggio da giocare'), 'Admin: no second tie-break while one is still to play');
  perform tiebreak_test.check(tiebreak_test.admin_refuses('tb-admin-test', 'c18', jsonb_build_array(
      v_last || '{"refereeReportSavedAt":"2026-11-22T10:01:00Z"}',
      '{"id":"evil","phase":"bracket","teamAId":"c1","teamBId":"c2","scoreA":0,"scoreB":0,"played":false,"status":"scheduled"}'::jsonb),
    'lo spareggio deve essere da giocare'), 'Admin: any other new match is refused');
  perform tiebreak_test.check(tiebreak_test.admin_refuses('tb-admin-test', 'c18', jsonb_build_array(
      v_last || '{"refereeReportSavedAt":"2026-11-22T10:01:00Z"}',
      tiebreak_test.tiebreak('tb-d-1', 'DTB1', 'Girone D', '{"teamAId":"d1","teamBId":"d2"}')),
    'il girone non è ancora concluso'), 'Admin: a group still being played cannot get a tie-break');
  perform tiebreak_test.check(tiebreak_test.admin_refuses('tb-admin-test', 'ghost', jsonb_build_array(
      tiebreak_test.tiebreak('ghost', 'CTB2', 'Girone C', '{"teamAId":"c1","teamBId":"c2"}')),
    'Match ghost non trovato nello snapshot live'), 'Admin: the reported match itself must exist');

  v_out := public.flbp_admin_push_match_result('tb-admin-test', 'tb-test', 'f3', jsonb_build_array(
    tiebreak_test.result('tb-admin-test', 'f3', 10, 8, '2026-11-22T10:02:00Z'),
    tiebreak_test.tiebreak('ftb-1', 'FTB1', 'Girone Finale', '{"teamIds":["c1","c2","c3"],"teamAId":"c1","teamBId":"c2"}')), null);
  perform tiebreak_test.check(v_out ->> 'ok' = 'true' and v_out ->> 'created_matches' = '1',
    'Admin: the last final-group result creates the three-team FTB');

  v_out := public.flbp_admin_push_match_result('tb-admin-test', 'tb-test', 'u20', jsonb_build_array(
    tiebreak_test.result('tb-admin-test', 'u20', 10, 8, '2026-11-22T10:03:00Z'),
    tiebreak_test.tiebreak('tb-u-1', '1TB1', 'Girone 1', '{"teamAId":"u1","teamBId":"u2"}')), null);
  perform tiebreak_test.check(v_out ->> 'ok' = 'true', 'Admin: a renamed group keeps the code the app numbers');
end;
$$;
reset role;

select tiebreak_test.check(
  (select count(*) = 3 from public.workspace_state ws, jsonb_array_elements(ws.state -> 'tournamentMatches') m
    where ws.workspace_id = 'tb-admin-test' and m.value ->> 'id' in ('tb-c-1', 'ftb-1', 'tb-u-1'))
  and (select count(*) = 3 from public.workspace_state ws, jsonb_array_elements(ws.state #> '{tournament,matches}') m
    where ws.workspace_id = 'tb-admin-test' and m.value ->> 'id' in ('tb-c-1', 'ftb-1', 'tb-u-1'))
  and (select count(*) = 3 from public.public_workspace_state ws, jsonb_array_elements(ws.state -> 'tournamentMatches') m
    where ws.workspace_id = 'tb-admin-test' and m.value ->> 'id' in ('tb-c-1', 'ftb-1', 'tb-u-1')),
  'Admin: created tie-breaks are in the private and public live arrays');
select tiebreak_test.check(
  tiebreak_test.match('tb-admin-test', 'tb-c-1') -> 'teamIds' = '["c1","c2","c3"]'::jsonb
    and not (tiebreak_test.match('tb-admin-test', 'tb-c-1') ? 'injectedField')
    and tiebreak_test.match('tb-admin-test', 'tb-u-1') ->> 'code' = '1TB1'
    and tiebreak_test.match('tb-admin-test', 'c18') ->> 'status' = 'finished',
  'Admin: only tie-break fields are stored, with the code as sent');
select tiebreak_test.check(
  (select count(*) = 3 from public.tournament_matches
    where workspace_id = 'tb-admin-test' and tournament_id = 'tb-test' and id in ('tb-c-1', 'ftb-1', 'tb-u-1'))
  and (select count(*) = 3 from public.public_tournament_matches
    where workspace_id = 'tb-admin-test' and tournament_id = 'tb-test' and id in ('tb-c-1', 'ftb-1', 'tb-u-1'))
  and not exists (select 1 from public.tournament_matches where workspace_id = 'tb-admin-test' and id in ('evil', 'tb-c-2', 'tb-d-1', 'ghost')),
  'Admin: normalized rows hold the created tie-breaks and nothing refused');

-- Referee entrypoint: anonymous caller with the referee password.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v_out jsonb;
begin
  v_out := public.flbp_referee_push_match_result('tb-referee-test', 'tb-test', 'c18', 'fixture-only-secret', jsonb_build_array(
    tiebreak_test.result('tb-referee-test', 'c18', 10, 8, '2026-11-22T11:00:00Z'),
    tiebreak_test.tiebreak('rtb-c-1', 'CTB1', 'Girone C', '{"teamAId":"c1","teamBId":"c3","privateNote":"not stored"}')), 'v1');
  perform tiebreak_test.check(v_out ->> 'ok' = 'true' and current_setting('response.status') = '200',
    'Referee: the last group result creates the two-team tie-break');

  v_out := public.flbp_referee_push_match_result('tb-referee-test', 'tb-test', 'f3', 'fixture-only-secret', jsonb_build_array(
    tiebreak_test.result('tb-referee-test', 'f3', 10, 8, '2026-11-22T11:01:00Z'),
    tiebreak_test.tiebreak('rftb-1', 'FTB1', 'Girone Finale', '{"teamIds":["c1","c2","c3"],"teamAId":"c1","teamBId":"c2"}')), 'v1');
  perform tiebreak_test.check(v_out ->> 'ok' = 'true', 'Referee: the last final-group result creates the three-team FTB');

  v_out := public.flbp_referee_push_match_result('tb-referee-test', 'tb-test', 'c13', 'fixture-only-secret', jsonb_build_array(
    tiebreak_test.result('tb-referee-test', 'c13', 10, 7, '2026-11-22T11:02:00Z'),
    '{"id":"evil","phase":"bracket","teamAId":"c1","teamBId":"c2","scoreA":0,"scoreB":0,"played":false,"status":"scheduled"}'::jsonb), 'v1');
  perform tiebreak_test.check(v_out ->> 'ok' = 'false' and v_out ->> 'reason' = 'invalid_report'
      and v_out ->> 'message' like 'Creazione partita non autorizzata:%' and current_setting('response.status') = '400',
    'Referee: any other new match is refused with a readable reason');

  v_out := public.flbp_referee_push_match_result('tb-referee-test', 'tb-test', 'u20', 'fixture-only-secret', jsonb_build_array(
    tiebreak_test.result('tb-referee-test', 'u20', 10, 8, '2026-11-22T11:03:00Z'),
    tiebreak_test.tiebreak('rtb-u-1', '1TB1', 'Girone 1', '{"teamAId":"u1","teamBId":"u2"}'),
    tiebreak_test.tiebreak('rtb-u-2', '1TB1', 'Girone 1', '{"teamAId":"u2","teamBId":"u1"}')), 'v1');
  perform tiebreak_test.check(v_out ->> 'ok' = 'false' and v_out ->> 'message' like '%un solo spareggio nuovo per girone%',
    'Referee: one new tie-break per group per save');
end;
$$;
reset role;

select tiebreak_test.check(
  tiebreak_test.match('tb-referee-test', 'rtb-c-1') ->> 'teamBId' = 'c3'
    and not (tiebreak_test.match('tb-referee-test', 'rtb-c-1') ? 'privateNote')
    and tiebreak_test.match('tb-referee-test', 'rftb-1') -> 'teamIds' = '["c1","c2","c3"]'::jsonb
    and tiebreak_test.match('tb-referee-test', 'evil') is null
    and tiebreak_test.match('tb-referee-test', 'rtb-u-1') is null
    and tiebreak_test.match('tb-referee-test', 'u20') ->> 'status' = 'scheduled'
    and tiebreak_test.match('tb-referee-test', 'c13') ->> 'scoreB' = '8',
  'Referee: created tie-breaks are stored, refused saves change nothing');
select tiebreak_test.check(
  (select count(*) = 2 from public.public_workspace_state ws, jsonb_array_elements(ws.state -> 'tournamentMatches') m
    where ws.workspace_id = 'tb-referee-test' and m.value ->> 'id' in ('rtb-c-1', 'rftb-1')),
  'Referee: created tie-breaks reach the public live state');

select count(*) as tiebreak_checks from tiebreak_test.checks;
rollback;
