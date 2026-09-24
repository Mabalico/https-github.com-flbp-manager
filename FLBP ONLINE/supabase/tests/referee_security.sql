-- Disposable PostgreSQL only. No production data or credentials. All fixtures
-- roll back; the entrypoints and privileges being tested are the real ones.
begin;
create schema flbp_test_referee;
grant usage on schema flbp_test_referee to anon,authenticated;
create table flbp_test_referee.checks(label text);
grant insert on flbp_test_referee.checks to anon,authenticated;
create function flbp_test_referee.assert_true(p_condition boolean,p_label text)
returns text language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'Referee assertion failed: %',p_label; end if;
  insert into flbp_test_referee.checks values(p_label);
  return 'PASS: '||p_label;
end;
$$;
create sequence flbp_test_referee.write_probe;
create function flbp_test_referee.probe_write() returns trigger language plpgsql as $$
begin perform nextval('flbp_test_referee.write_probe'); return new; end;
$$;
create trigger flbp_test_referee_probe after update on public.workspace_state
  for each row execute function flbp_test_referee.probe_write();
create function flbp_test_referee.fail_public_write() returns trigger language plpgsql as $$
begin
  if current_setting('test.referee_fail_public',true)='on' then raise exception 'Injected late public write failure'; end if;
  return new;
end;
$$;
create trigger flbp_test_referee_fail before update on public.public_workspace_state
  for each row execute function flbp_test_referee.fail_public_write();

insert into public.workspaces(id) values ('referee-security-test');
insert into public.workspace_state(workspace_id,state,updated_at) values ('referee-security-test',
  '{"settings":{"private":"keep me"},"history":[{"id":"archived"}],"teams":[{"id":"a","name":"Team A","player1BirthDate":"2000-01-01"},{"id":"b","name":"Team B"}],
    "tournament":{"id":"referee-test","name":"Test","refereesPassword":"fixture-only-secret","refereesAuthVersion":"v1","type":"groups_elimination",
      "config":{"finalRoundRobin":{"enabled":true,"activated":true}},"groups":[{"name":"Girone Finale","stage":"final","teams":[{"id":"a"},{"id":"b"}]}]},
    "tournamentMatches":[
      {"id":"one","teamAId":"a","teamBId":"b","phase":"groups","groupName":"Girone Finale","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","privateMatchNote":"never public"},
      {"id":"two","teamAId":"a","teamBId":"b","phase":"bracket","scoreA":0,"scoreB":0,"played":false,"status":"scheduled"}]}',
  '2026-01-01T00:00:00Z');
update public.workspace_state set state=jsonb_set(state,'{tournament,matches}',state->'tournamentMatches') where workspace_id='referee-security-test';
insert into public.public_workspace_state(workspace_id,state,updated_at)
  select workspace_id,state-'settings'-'history' #- '{tournament,refereesPassword}'
    #- '{teams,0,player1BirthDate}' #- '{tournamentMatches,0,privateMatchNote}' #- '{tournament,matches,0,privateMatchNote}',updated_at
  from public.workspace_state where workspace_id='referee-security-test';
select set_config('request.jwt.claims','{"role":"anon"}',true);

set local role anon;
select flbp_test_referee.assert_true((public.flbp_referee_auth_check('referee-security-test','referee-test','wrong')->>'ok')::boolean=false,
  'anonymous wrong password is rejected');
select flbp_test_referee.assert_true((public.flbp_referee_push_live_state('referee-security-test','referee-test','wrong','{}','{}',null)->>'ok')::boolean=false,
  'legacy wrong password returns a rejection instead of throwing away its audit');
select flbp_test_referee.assert_true(current_setting('response.status')='403','legacy rejected write also sets non-success HTTP status');
select flbp_test_referee.assert_true(not has_function_privilege('anon','public.flbp_referee_check_credentials(text,text,text,text,text)','execute')
  and not has_function_privilege('anon','public.flbp_referee_apply_match_updates(text,text,jsonb)','execute'),
  'anonymous callers cannot invoke internal credential or write helpers');
reset role;

do $$
declare v_i integer; v_out jsonb;
begin
  for v_i in 1..12 loop perform public.flbp_referee_auth_check('referee-security-test','referee-test','wrong'); end loop;
  perform flbp_test_referee.assert_true(public.flbp_referee_auth_is_rate_limited('referee-security-test','referee-test'),'abuse threshold reached');
  v_out:=public.flbp_referee_auth_check('referee-security-test','referee-test','fixture-only-secret');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean and not(v_out?'state'),'valid login survives shared failures without disclosing private state');
  v_out:=public.flbp_referee_pull_live_state('referee-security-test','referee-test','fixture-only-secret');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean and v_out#>>'{state,tournament,id}'='referee-test','valid pull survives shared failures');
  perform flbp_test_referee.assert_true(exists(select 1 from public.referee_auth_audit where workspace_id='referee-security-test'
    and action='push_live_state' and not ok and reason='bad_password'),'failed push audit survives transaction');
  perform set_config('request.headers','{"x-forwarded-for":"trusted","x-real-ip":"127.0.0.1","x-referee-id":"admin"}',true);
  perform set_config('request.jwt.claims','{"role":"anon","user_metadata":{"role":"admin"}}',true);
  v_out:=public.flbp_referee_auth_check('referee-security-test','referee-test','wrong');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false and not(v_out?'state') and not(v_out?'auth_version'),'spoofed headers and metadata never authenticate');
  v_out:=public.flbp_referee_auth_check('referee-security-test','different-tournament','fixture-only-secret');
  perform flbp_test_referee.assert_true(v_out->>'reason'='tournament_mismatch','password cannot authenticate another tournament');
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret','[]','old-version');
  perform flbp_test_referee.assert_true(v_out->>'reason'='auth_version_mismatch','revoked auth version is rejected and audited');
end;
$$;
select 'PASS: valid clients remain available after shared abuse; failed audits persist; spoofed identities fail' as result;

do $$
declare
  v_state jsonb; v_public jsonb; v_out jsonb; v_match jsonb; v_patch jsonb; v_backup jsonb; v_history jsonb;
  v_base timestamptz; v_count bigint; v_probe bigint; v_mode text; v_rows jsonb;
begin
  select state,updated_at into v_state,v_base from public.workspace_state where workspace_id='referee-security-test';
  v_match:=(v_state->'tournamentMatches'->0)||'{"scoreA":10,"scoreB":2,"played":true,"status":"finished","refereeReportSavedAt":"2026-09-24T10:00:00Z","refereeReportFinalId":"fixture-report-one","injectedPrivateField":"do not publish"}';
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret',jsonb_build_array(v_match),'v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean,'modern result succeeds despite shared abuse');
  perform flbp_test_referee.assert_true(current_setting('response.status')='200','successful push explicitly returns HTTP success');
  select state,updated_at into v_state,v_base from public.workspace_state where workspace_id='referee-security-test';
  select state into v_public from public.public_workspace_state where workspace_id='referee-security-test';
  perform flbp_test_referee.assert_true(v_state#>>'{tournamentMatches,0,scoreA}'='10','actual referee result persisted');
  perform flbp_test_referee.assert_true(v_state#>>'{tournamentMatches,0,privateMatchNote}'='never public'
    and not((v_state->'tournamentMatches'->0)?'injectedPrivateField'),'unknown incoming properties are ignored while existing private match fields are preserved');
  perform flbp_test_referee.assert_true(not((v_public->'tournamentMatches'->0)?'privateMatchNote')
    and not((v_public->'tournamentMatches'->0)?'injectedPrivateField'),'private match properties never enter public mirror');
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','wrong',jsonb_build_array(v_match),'v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false and exists(select 1 from public.referee_auth_audit
    where workspace_id='referee-security-test' and action='push_match_result' and not ok),'modern failed password produces durable audit');
  perform flbp_test_referee.assert_true(current_setting('response.status')='429','abuse rejection also sets non-success HTTP status');

  -- Exploit regression: a referee submits a replacement password, private
  -- settings, archives, team identity and an arbitrary public snapshot.
  v_patch:=jsonb_set(v_state,'{settings}','{"private":"attacker"}');
  v_patch:=jsonb_set(v_patch,'{tournament,refereesPassword}','"attacker-password"');
  v_patch:=jsonb_set(v_patch,'{history}','[]');
  v_patch:=jsonb_set(v_patch,'{teams,0,name}','"attacker-team"');
  v_match:=(v_state->'tournamentMatches'->1)||'{"scoreA":11,"scoreB":3,"status":"finished","played":true,"refereeReportSavedAt":"2026-09-24T10:01:00Z"}';
  v_patch:=jsonb_set(v_patch,'{tournamentMatches,1}',v_match);
  v_patch:=jsonb_set(v_patch,'{tournament,matches,1}',v_match);
  v_out:=public.flbp_referee_push_live_state('referee-security-test','referee-test','fixture-only-secret',v_patch,'{"adminSecret":"leak"}',v_base);
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean,'legacy report remains compatible');
  select state,updated_at into v_backup,v_base from public.workspace_state where workspace_id='referee-security-test';
  perform flbp_test_referee.assert_true(v_backup-'tournamentMatches'#-'{tournament,matches}' = v_state-'tournamentMatches'#-'{tournament,matches}',
    'legacy snapshot cannot overwrite settings, archives, teams or password');
  perform flbp_test_referee.assert_true(v_backup#>>'{tournamentMatches,1,scoreA}'='11','legacy match change is applied');
  perform flbp_test_referee.assert_true(not exists(select 1 from public.public_workspace_state where workspace_id='referee-security-test' and state?'adminSecret'),
    'caller public snapshot is ignored');
  v_state:=v_backup;

  v_out:=public.flbp_referee_push_live_state('referee-security-test','referee-test','fixture-only-secret',v_state,'{}',null);
  perform flbp_test_referee.assert_true(v_out->>'reason'='conflict','missing baseline cannot perform a blind overwrite');
  perform flbp_test_referee.assert_true(current_setting('response.status')='409','conflict retains HTTP 409 compatibility');
  v_out:=public.flbp_referee_push_live_state('referee-security-test','referee-test','fixture-only-secret',v_state,'{}',v_base-interval '1 second');
  perform flbp_test_referee.assert_true(v_out->>'reason'='conflict','stale snapshot is rejected');
  v_patch:=jsonb_set(jsonb_set(v_state,'{tournamentMatches}','[]'),'{tournament,matches}','[]');
  v_out:=public.flbp_referee_push_live_state('referee-security-test','referee-test','fixture-only-secret',v_patch,'{}',v_base);
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false,'removing matches requires Admin');
  v_match:=(v_state->'tournamentMatches'->0)||'{"scoreA":99,"refereeReportSavedAt":"2026-09-24T09:00:00Z"}';
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret',jsonb_build_array(v_match),'v1');
  perform flbp_test_referee.assert_true(v_out->>'reason'='conflict','older report cannot replace the authoritative result');
  perform flbp_test_referee.assert_true((select state=v_state from public.workspace_state where workspace_id='referee-security-test'),'rejected operations preserve state');

  -- A failure after workspace mutation must roll back private/public state,
  -- normalized rows and version history while keeping the rejection audit.
  select state into v_public from public.public_workspace_state where workspace_id='referee-security-test';
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_rows from public.tournament_matches t where workspace_id='referee-security-test';
  if to_regclass('public.workspace_state_versions') is not null then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into v_history from public.workspace_state_versions t where workspace_id='referee-security-test';
  end if;
  select last_value into v_probe from flbp_test_referee.write_probe;
  select count(*) into v_count from public.referee_auth_audit where workspace_id='referee-security-test' and reason='invalid_report';
  perform set_config('test.referee_fail_public','on',true);
  v_match:=(v_state->'tournamentMatches'->0)||'{"scoreA":12,"refereeReportSavedAt":"2026-09-24T11:00:00Z"}';
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret',jsonb_build_array(v_match),'v1');
  perform set_config('test.referee_fail_public','off',true);
  perform flbp_test_referee.assert_true(v_out->>'message'='Injected late public write failure','late failure was reached');
  perform flbp_test_referee.assert_true((select last_value>v_probe from flbp_test_referee.write_probe),'workspace write happened before injected failure');
  perform flbp_test_referee.assert_true((select state=v_state from public.workspace_state where workspace_id='referee-security-test')
    and (select state=v_public from public.public_workspace_state where workspace_id='referee-security-test'),'late failure rolls back both snapshots');
  perform flbp_test_referee.assert_true((select coalesce(jsonb_agg(to_jsonb(t)),'[]')=v_rows from public.tournament_matches t where workspace_id='referee-security-test'),
    'late failure rolls back normalized rows');
  if to_regclass('public.workspace_state_versions') is not null then
    perform flbp_test_referee.assert_true((select coalesce(jsonb_agg(to_jsonb(t)),'[]')=v_history from public.workspace_state_versions t where workspace_id='referee-security-test'),
      'late failure rolls back version history');
  end if;
  perform flbp_test_referee.assert_true((select count(*)=v_count+1 from public.referee_auth_audit where workspace_id='referee-security-test' and reason='invalid_report'),
    'late failure audit remains outside the rolled-back write block');

  -- Modern data-plane fencing is still enforced by its real triggers.
  if to_regclass('public.flbp_data_plane') is not null then
    foreach v_mode in array array['local','recovery'] loop
      insert into public.flbp_data_plane(workspace_id,mode,node_id,base_url,epoch,lease_expires_at)
        values('referee-security-test',v_mode,'fixture','https://fixture.invalid',1,now()+interval '1 hour')
        on conflict(workspace_id) do update set mode=excluded.mode;
      v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret',jsonb_build_array(v_match),'v1');
      perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false and (select state=v_state from public.workspace_state where workspace_id='referee-security-test'),
        'local/recovery fencing remains effective');
    end loop;
    update public.flbp_data_plane set mode='cloud' where workspace_id='referee-security-test';
  end if;

  v_match:='{"id":"new-ftb","phase":"groups","groupName":"Girone Finale","teamAId":"a","teamBId":"b","code":"FTB1","isTieBreak":true,"scoreA":0,"scoreB":0,"played":false,"status":"scheduled","targetScore":1}';
  v_patch:=jsonb_set(v_state,'{tournamentMatches}',(v_state->'tournamentMatches')||jsonb_build_array(v_match));
  v_patch:=jsonb_set(v_patch,'{tournament,matches}',v_patch->'tournamentMatches');
  v_out:=public.flbp_referee_push_live_state('referee-security-test','referee-test','fixture-only-secret',v_patch,'{}',v_base);
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean and (select jsonb_array_length(state->'tournamentMatches')=3 from public.workspace_state where workspace_id='referee-security-test'),
    'legacy final tie-break creation remains compatible');
  select state into v_state from public.workspace_state where workspace_id='referee-security-test';
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','evil','fixture-only-secret',
    '[{"id":"evil","teamAId":"a","teamBId":"b","phase":"bracket","status":"scheduled","scoreA":0,"scoreB":0,"played":false}]','v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false,'arbitrary new tournament match is rejected');
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','foreign-ftb','fixture-only-secret',
    jsonb_build_array(v_match||'{"id":"foreign-ftb","code":"FTB2","teamBId":"foreign-team"}'),'v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false,'foreign or second pending tie-break is rejected');
  perform flbp_test_referee.assert_true((select state=v_state from public.workspace_state where workspace_id='referee-security-test'),'invalid new matches do not change the tournament');
  -- The modern endpoint historically also accepts one JSON object.
  v_match:=(v_state->'tournamentMatches'->0)||'{"scoreA":13,"refereeReportSavedAt":"2026-09-24T12:00:00Z"}';
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','one','fixture-only-secret',v_match,'v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean,'single-object patch remains compatible');
  -- Completing one FTB can create the next one in the same atomic patch.
  select state into v_state from public.workspace_state where workspace_id='referee-security-test';
  v_patch:=jsonb_build_array((v_state->'tournamentMatches'->2)||'{"status":"finished","played":true,"scoreA":1,"refereeReportSavedAt":"2026-09-24T12:01:00Z"}',
    '{"id":"next-ftb","phase":"groups","groupName":"Girone Finale","teamAId":"a","teamBId":"b","code":"FTB2","isTieBreak":true,"scoreA":0,"scoreB":0,"played":false,"status":"scheduled"}'::jsonb);
  v_out:=public.flbp_referee_push_match_result('referee-security-test','referee-test','new-ftb','fixture-only-secret',v_patch,'v1');
  perform flbp_test_referee.assert_true((v_out->>'ok')::boolean and (select jsonb_array_length(state->'tournamentMatches')=4 from public.workspace_state where workspace_id='referee-security-test'),
    'finishing a tie-break and scheduling its successor is atomic');
end;
$$;
select 'PASS: modern and legacy reports, snapshot exploit prevention, stale writes, rollback, public privacy, FTB compatibility and data-plane fencing' as result;
do $$
declare v_state jsonb; v_result jsonb;
begin
  insert into public.workspaces(id) values('referee-security-rounds');
  v_state:='{"teams":[],"tournament":{"id":"rounds-only","refereesPassword":"fixture-only-secret","rounds":[[{"id":"r1","scoreA":0,"scoreB":0,"played":false,"status":"scheduled"}]]}}';
  insert into public.workspace_state(workspace_id,state,updated_at) values('referee-security-rounds',v_state,'2026-01-01T00:00:00Z');
  insert into public.public_workspace_state(workspace_id,state,updated_at) values('referee-security-rounds',v_state#-'{tournament,refereesPassword}','2026-01-01T00:00:00Z');
  v_state:=jsonb_set(v_state,'{tournament,rounds,0,0}',(v_state#>'{tournament,rounds,0,0}')||'{"scoreA":10,"scoreB":3,"status":"finished","played":true}');
  v_result:=public.flbp_referee_push_live_state('referee-security-rounds','rounds-only','fixture-only-secret',v_state,'{}','2026-01-01T00:00:00Z');
  perform flbp_test_referee.assert_true((v_result->>'ok')::boolean
    and (select state#>>'{tournament,rounds,0,0,scoreA}'='10' from public.workspace_state where workspace_id='referee-security-rounds')
    and (select state#>>'{tournament,rounds,0,0,scoreA}'='10' from public.public_workspace_state where workspace_id='referee-security-rounds'),
    'legacy rounds-only snapshots update their existing nested representation');
end;
$$;
select 'PASS: '||count(*)||' real SQL assertions' as result from flbp_test_referee.checks;
do $$
declare v_state jsonb; v_public jsonb; v_before jsonb; v_out jsonb; v_patch jsonb; v_mode text;
begin
  insert into public.workspaces(id) values('referee-security-repair');
  v_state:='{"settings":{"secret":"PRIVATE-MARKER"},"playerAliases":{"secret":"PRIVATE-MARKER"},"fantaSettings":{"enabled":true,"secret":"PRIVATE-MARKER"},
    "teams":[{"id":"a","name":"A","player1BirthDate":"2000-01-01","secret":"PRIVATE-MARKER"},{"id":"b","name":"B"}],
    "tournament":{"id":"repair","name":"Repair","startDate":"2026-09-24","type":"elimination","refereesPassword":"fixture-only-secret","secret":"PRIVATE-MARKER",
      "config":{"advancingPerGroup":2,"secret":"PRIVATE-MARKER","finalRoundRobin":{"enabled":false,"secret":"PRIVATE-MARKER"}},
      "teams":[{"id":"a","player1BirthDate":"2000-01-01","secret":"PRIVATE-MARKER"}],
      "groups":[{"id":"g","name":"G","secret":"PRIVATE-MARKER","teams":[{"id":"a","secret":"PRIVATE-MARKER","player1BirthDate":"2000-01-01"}]}]},
    "tournamentMatches":[{"id":"r1","teamAId":"a","teamBId":"b","phase":"bracket","scoreA":0,"scoreB":0,"played":false,"status":"scheduled","secret":"PRIVATE-MARKER",
      "stats":[{"teamId":"a","playerName":"Player A","canestri":1,"soffi":0,"secret":"PRIVATE-MARKER"}],
      "refereeReportAudit":[{"id":"audit","matchId":"r1","source":"referee","refereeName":"Ref","savedAt":"2026-09-24T10:00:00Z","scoreA":1,"scoreB":0,"secret":"PRIVATE-MARKER",
        "stats":[{"teamId":"a","playerName":"Player A","canestri":1,"soffi":0,"secret":"PRIVATE-MARKER"}]}]}]}';
  v_state:=jsonb_set(v_state,'{tournamentMatches}',(v_state->'tournamentMatches')||
    '[{"id":"untouched","teamAId":"a","teamBId":"b","scoreA":4,"scoreB":1,"status":"finished","played":true,"refereeReportSavedAt":"2026-09-24T09:00:00Z",
      "refereeReportAudit":[{"id":"old-audit","scoreA":4,"scoreB":1,"secret":"PRIVATE-MARKER"}],"stats":[{"teamId":"a","playerName":"Player A","canestri":4,"soffi":0}]}]'::jsonb);
  v_state:=jsonb_set(v_state,'{tournament,matches}',v_state->'tournamentMatches');
  v_state:=jsonb_set(v_state,'{tournament,rounds}',jsonb_build_array(v_state->'tournamentMatches'));
  foreach v_mode in array array['missing','tournament','match'] loop
    insert into public.workspace_state(workspace_id,state,updated_at) values('referee-security-repair',v_state,'2026-01-01')
      on conflict(workspace_id) do update set state=excluded.state,updated_at=excluded.updated_at;
    v_public:=public.flbp_referee_public_projection(v_state,'state')||'{"logo":"keep-public-logo","tournamentHistory":[{"id":"keep-public-history"}]}';
    if v_mode='missing' then
      delete from public.public_workspace_state where workspace_id='referee-security-repair';v_before:=null;
    else
      if v_mode='tournament' then v_public:=jsonb_set(v_public,'{tournament,id}','"old-tournament"');
      else v_public:=jsonb_set(jsonb_set(jsonb_set(v_public,'{tournamentMatches}','[]'),'{tournament,matches}','[]'),'{tournament,rounds}','[]');end if;
      insert into public.public_workspace_state(workspace_id,state,updated_at) values('referee-security-repair',v_public,'2026-01-01')
        on conflict(workspace_id) do update set state=excluded.state,updated_at=excluded.updated_at;
      v_before:=v_public;
    end if;
    if to_regprocedure('public.flbp_local_sync_live_normalized_internal(text,jsonb)') is not null then
      insert into public.public_tournaments(workspace_id,id,name,start_date,type,status)
        values('referee-security-repair','repair','stale',now(),'elimination','live') on conflict do nothing;
      insert into public.public_tournament_matches(workspace_id,tournament_id,id)
        values('referee-security-repair','repair','stale-match') on conflict do nothing;
      insert into public.public_tournament_teams(workspace_id,tournament_id,id,name,player1,player2)
        values('referee-security-repair','repair','stale-team','stale','','') on conflict do nothing;
    end if;
    v_out:=public.flbp_referee_push_match_result('referee-security-repair','repair','unknown','fixture-only-secret','[{"id":"unknown"}]',null);
    perform flbp_test_referee.assert_true((v_out->>'ok')::boolean=false
      and (select state from public.public_workspace_state where workspace_id='referee-security-repair') is not distinct from v_before,
      'invalid update does not partially repair the public mirror: '||v_mode);
    v_patch:=jsonb_set(v_state,'{tournamentMatches,0}',(v_state->'tournamentMatches'->0)||'{"scoreA":10,"scoreB":2,"played":true,"status":"finished","refereeReportSavedAt":"2026-09-24T12:00:00Z"}');
    v_out:=public.flbp_referee_push_live_state('referee-security-repair','repair','fixture-only-secret',v_patch,'{"secret":"PRIVATE-MARKER"}','2026-01-01');
    perform flbp_test_referee.assert_true((v_out->>'ok')::boolean,'legacy adapter repairs public mirror: '||v_mode);
    select state into v_public from public.public_workspace_state where workspace_id='referee-security-repair';
    perform flbp_test_referee.assert_true(v_public#>>'{tournament,id}'='repair' and v_public#>>'{tournamentMatches,0,scoreA}'='10'
      and v_public::text not like '%PRIVATE-MARKER%' and v_public::text not like '%BirthDate%'
      and v_public::text not like '%fixture-only-secret%','recursive repaired mirror contains only public fields: '||v_mode);
    if v_mode<>'missing' then
      perform flbp_test_referee.assert_true(v_public->>'logo'='keep-public-logo' and v_public#>>'{tournamentHistory,0,id}'='keep-public-history',
        'repair preserves previously public non-live content: '||v_mode);
    end if;
    if to_regprocedure('public.flbp_match_result_upsert_rows(text,text,jsonb,jsonb,timestamp with time zone)') is not null then
      perform flbp_test_referee.assert_true((select config::text not like '%PRIVATE-MARKER%' from public.public_tournaments where workspace_id='referee-security-repair' and id='repair')
        and (select referee_report_audit::text not like '%PRIVATE-MARKER%' from public.public_tournament_matches where workspace_id='referee-security-repair' and id='r1'),
        'normalized public config/audit do not leak private extensions: '||v_mode);
    end if;
    if to_regprocedure('public.flbp_local_sync_live_normalized_internal(text,jsonb)') is not null then
      perform flbp_test_referee.assert_true((select count(*)=2 from public.public_tournament_matches where workspace_id='referee-security-repair' and tournament_id='repair')
        and (select score_a=4 and referee_report_audit::text not like '%PRIVATE-MARKER%' from public.public_tournament_matches where workspace_id='referee-security-repair' and id='untouched')
        and (select canestri=4 from public.public_tournament_match_stats where workspace_id='referee-security-repair' and match_id='untouched'),
        'repair rebuilds untouched public matches/stats and removes stale rows: '||v_mode);
      perform flbp_test_referee.assert_true((select count(*)=1 from public.public_tournament_teams where workspace_id='referee-security-repair' and tournament_id='repair')
        and exists(select 1 from public.public_tournament_teams where workspace_id='referee-security-repair' and id='a')
        and exists(select 1 from public.public_tournament_groups where workspace_id='referee-security-repair' and id='g')
        and exists(select 1 from public.public_tournament_group_teams where workspace_id='referee-security-repair' and group_id='g' and team_id='a'),
        'repair rebuilds current public teams/groups without stale teams: '||v_mode);
    end if;
  end loop;
  perform flbp_test_referee.assert_true(public.flbp_referee_public_projection('{"player1BirthDate":"2000-09-25"}','team','2026-09-24')->'player1U25'='true'
    and public.flbp_referee_public_projection('{"player1BirthDate":"2000-09-25"}','team','2026-09-25')->'player1U25'='false'
    and public.flbp_referee_public_projection('{"player1BirthDate":"2000-02-29"}','team','2026-02-28')->'player1U25'='true'
    and public.flbp_referee_public_projection('{"player1BirthDate":"2000-02-29"}','team','2026-03-01')->'player1U25'='false',
    'public U25 projection follows existing completed-years rules at birthday and leap-day boundaries');
end;
$$;
select 'PASS: '||count(*)||' real SQL assertions including missing/stale public mirror repair' as result from flbp_test_referee.checks;
rollback;
