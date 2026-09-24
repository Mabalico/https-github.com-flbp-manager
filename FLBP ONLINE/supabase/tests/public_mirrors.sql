-- Real entrypoints/roles in disposable PostgreSQL; all fixtures roll back.
begin;
create schema mirror_test;
grant usage on schema mirror_test to anon,authenticated;
create table mirror_test.checks(label text);
grant insert on mirror_test.checks to anon,authenticated;
create function mirror_test.check(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Mirror assertion failed: %',p_label; end if;
  insert into mirror_test.checks values(p_label);
end;
$$;
insert into public.workspaces(id) values('mirror-test');
insert into public.workspace_state(workspace_id,state,updated_at) values('mirror-test',
  '{"privateExtension":"never-public","teams":[{"id":"a","name":"A","player1BirthDate":"2001-01-01"},{"id":"b","name":"B"}],
    "tournament":{"id":"mirror-tournament","name":"Mirror test","type":"groups_elimination","refereesPassword":"fixture-only","refereesAuthVersion":"v1","privateTournament":"never-public","config":{}},
    "tournamentMatches":[{"id":"one","teamAId":"a","teamBId":"b","phase":"bracket","scoreA":0,"scoreB":0,"status":"scheduled","played":false}],
    "fantaSettings":{"enabled":true}}','2026-01-01T00:00:00Z');
insert into public.public_workspace_state(workspace_id,state,updated_at)
  values('mirror-test','{"logoUrl":"keep-logo","tournamentHistory":[{"id":"keep-history"}],"hallOfFame":[{"id":"keep-award"}],"teams":[],"tournament":null,"tournamentMatches":[]}',now());

select mirror_test.check(not has_table_privilege('authenticated','public.public_workspace_state','INSERT')
  and not has_table_privilege('authenticated','public.public_workspace_state','UPDATE')
  and not has_table_privilege('authenticated','public.public_workspace_state','DELETE'),'full mirror direct DML revoked');
select mirror_test.check(not has_function_privilege('anon','public.flbp_admin_republish_public_workspace(text,text)','EXECUTE'),
  'anonymous repair RPC cannot be executed');
select mirror_test.check(has_function_privilege('authenticated','public.flbp_admin_republish_public_workspace(text,text)','EXECUTE'),
  'authenticated repair RPC remains reachable');
select set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"role":"admin"}}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.flbp_admin_republish_public_workspace('mirror-test');
    raise exception 'Untrusted admin claims were accepted';
  exception when insufficient_privilege then null; end;
  perform mirror_test.check(true,'untrusted user metadata cannot republish');
end;
$$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
set local role authenticated;
do $$
declare v_row jsonb;
begin
  begin
    perform public.flbp_admin_republish_public_workspace('missing-mirror-test');
    raise exception 'Missing canonical state was accepted';
  exception when raise_exception then
    if sqlerrm not like 'FLBP_CANONICAL_SNAPSHOT_MISSING:%' then raise; end if;
  end;
  perform mirror_test.check(true,'missing canonical snapshot fails instead of returning fake success');
  v_row:=public.flbp_admin_republish_public_workspace('mirror-test');
  perform mirror_test.check(v_row->>'workspace_id'='mirror-test' and v_row->>'updated_at' is not null,
    'repair returns an authoritative row');
  perform mirror_test.check(v_row#>>'{state,tournament,id}'='mirror-tournament'
    and v_row#>>'{state,tournamentMatches,0,scoreA}'='0','repair publishes canonical live data');
  perform mirror_test.check(v_row#>>'{state,logoUrl}'='keep-logo'
    and v_row#>>'{state,tournamentHistory,0,id}'='keep-history'
    and v_row#>>'{state,hallOfFame,0,id}'='keep-award','repair preserves existing public non-live content');
  perform mirror_test.check(v_row::text not like '%never-public%' and v_row::text not like '%fixture-only%'
    and v_row::text not like '%2001-01-01%','recursive projection hides private extension/password/birthdate');
  begin
    insert into public.public_workspace_state(workspace_id,state) values('mirror-test','{}')
      on conflict(workspace_id) do update set state=excluded.state;
    raise exception 'Direct upsert was accepted';
  exception when insufficient_privilege then null; end;
  perform mirror_test.check(true,'actual old-client upsert is denied even for a legitimate admin');
end;
$$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select mirror_test.check((public.flbp_referee_push_match_result('mirror-test','mirror-tournament','one','fixture-only',
  '[{"id":"one","teamAId":"a","teamBId":"b","phase":"bracket","scoreA":10,"scoreB":2,"status":"finished","played":true,"refereeReportSavedAt":"2026-09-25T10:00:00Z"}]','v1')->>'ok')::boolean,
  'real referee report still commits after raw mirror privilege revocation');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
declare v_state jsonb; v_public jsonb; v_out jsonb; v_base timestamptz; v_count integer;
begin
  select state,updated_at into v_state,v_base from public.workspace_state where workspace_id='mirror-test';
  select state into v_public from public.public_workspace_state where workspace_id='mirror-test';
  perform mirror_test.check(v_state#>>'{tournamentMatches,0,scoreA}'='10' and v_public#>>'{tournamentMatches,0,scoreA}'='10',
    'canonical and full mirror keep the new report');
  if to_regclass('public.public_workspace_live') is not null then
    perform mirror_test.check(not has_table_privilege('authenticated','public.public_workspace_live','INSERT')
      and not has_table_privilege('authenticated','public.public_workspace_live','UPDATE')
      and not has_table_privilege('authenticated','public.public_workspace_live','DELETE'),'compact mirror direct DML revoked');
    execute 'select count(*) from public.public_workspace_live where workspace_id=$1 and state#>>''{tournamentMatches,0,scoreA}''=''10'''
      into v_count using 'mirror-test';
    perform mirror_test.check(v_count=1,'compact mirror keeps the new referee report');
  end if;
  perform set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
  execute 'set local role authenticated';
  -- Both historical Admin snapshot signatures remain SECURITY DEFINER.
  if to_regprocedure('public.flbp_admin_push_workspace_state(text,jsonb,jsonb,timestamp with time zone,boolean,text)') is not null then
    execute 'select public.flbp_admin_push_workspace_state($1,$2,$3,$4,false,null)' into v_out using 'mirror-test',v_state,v_public,v_base;
  else
    execute 'select public.flbp_admin_push_workspace_state($1,$2,$3,$4,false)' into v_out using 'mirror-test',v_state,v_public,v_base;
  end if;
  perform mirror_test.check((v_out->>'ok')::boolean,'historical Admin workspace RPC retains publication privileges');
  if to_regprocedure('public.flbp_admin_push_workspace_state_v2(text,jsonb,jsonb,timestamp with time zone,boolean,text,text)') is not null then
    v_base:=(v_out->>'updated_at')::timestamptz;
    execute 'select public.flbp_admin_push_workspace_state_v2($1,$2,$3,$4,false,null,$5)' into v_out
      using 'mirror-test',v_state,v_public,v_base,'mirror-test-operation';
    perform mirror_test.check((v_out->>'ok')::boolean,'versioned Admin workspace RPC retains publication privileges');
  end if;
  v_out:=public.flbp_admin_republish_public_workspace('mirror-test');
  perform mirror_test.check(v_out#>>'{state,tournamentMatches,0,scoreA}'='10','republication derives current report without any caller snapshot');
  execute 'reset role';
end;
$$;

-- The old delayed second HTTP request must fail, preserving all current rows.
set local role authenticated;
do $$
begin
  if to_regclass('public.public_workspace_live') is not null then
    begin
      execute 'insert into public.public_workspace_live(workspace_id,state) values ($1,$2) on conflict(workspace_id) do update set state=excluded.state'
        using 'mirror-test','{"tournamentMatches":[{"id":"one","scoreA":0}]}'::jsonb;
      raise exception 'Stale compact upsert was accepted';
    exception when insufficient_privilege then null; end;
    perform mirror_test.check(true,'delayed second legacy POST cannot regress the compact mirror');
  end if;
  begin
    update public.public_workspace_state set state='{}' where workspace_id='mirror-test';
    raise exception 'Direct PATCH was accepted';
  exception when insufficient_privilege then null; end;
  perform mirror_test.check(true,'direct PATCH is denied before a row/advisory lock inversion');
end;
$$;
reset role;

create function mirror_test.fail_late() returns trigger language plpgsql as $$
begin raise exception 'Injected compact failure'; end;
$$;
do $$
declare v_before jsonb; v_row jsonb; v_mode text;
begin
  if to_regclass('public.public_workspace_live') is not null then
    execute 'create trigger mirror_test_fail before insert or update on public.public_workspace_live for each row execute function mirror_test.fail_late()';
    update public.workspace_state set state=jsonb_set(state,'{tournamentMatches,0,scoreA}','11') where workspace_id='mirror-test';
    select to_jsonb(p) into v_before from public.public_workspace_state p where workspace_id='mirror-test';
    begin
      perform public.flbp_admin_republish_public_workspace('mirror-test');
      raise exception 'Late mirror failure was ignored';
    exception when raise_exception then if sqlerrm<>'Injected compact failure' then raise; end if; end;
    perform mirror_test.check((select to_jsonb(p)=v_before from public.public_workspace_state p where workspace_id='mirror-test'),
      'compact failure rolls back the preceding full-mirror write');
    execute 'drop trigger mirror_test_fail on public.public_workspace_live';
    perform public.flbp_admin_republish_public_workspace('mirror-test');
  end if;
  if to_regclass('public.flbp_data_plane') is not null then
    foreach v_mode in array array['local','recovery'] loop
      execute 'insert into public.flbp_data_plane(workspace_id,mode,node_id,base_url,epoch,lease_expires_at)
        values($1,$2,''fixture-node'',''http://fixture.invalid'',1,now()+interval ''1 hour'')
        on conflict(workspace_id) do update set mode=excluded.mode' using 'mirror-test',v_mode;
      begin
        perform public.flbp_admin_republish_public_workspace('mirror-test');
        raise exception 'Data plane guard was ignored';
      exception when raise_exception then if sqlerrm not like 'FLBP_LOCAL_PRIMARY:%' and sqlerrm not like 'FLBP_DATA_PLANE_RECOVERY:%' then raise; end if; end;
      perform mirror_test.check(true,'republication is fenced in '||v_mode||' mode even when mirror is unchanged');
    end loop;
    execute 'delete from public.flbp_data_plane where workspace_id=$1' using 'mirror-test';
  end if;
  select state into v_before from public.public_workspace_state where workspace_id='mirror-test';
  update public.public_workspace_state set state='[]' where workspace_id='mirror-test';
  v_row:=public.flbp_admin_republish_public_workspace('mirror-test');
  perform mirror_test.check(jsonb_typeof(v_row->'state')='object'
    and v_row#>>'{state,tournament,id}'='mirror-tournament','malformed existing mirror is repaired as an object');
  update public.public_workspace_state set state=v_before where workspace_id='mirror-test';
  if to_regclass('public.admin_write_lease') is not null then
    execute 'insert into public.admin_write_lease(workspace_id,holder_id,heartbeat_at) values($1,''other-holder'',now())' using 'mirror-test';
    begin
      perform public.flbp_admin_republish_public_workspace('mirror-test','wrong-holder');
      raise exception 'Lease guard was ignored';
    exception when raise_exception then if sqlerrm not like 'FLBP_LEASE_HELD:%' then raise; end if; end;
    perform mirror_test.check(true,'republication respects the current Admin lease');
  end if;
end;
$$;
select 'PASS: '||count(*)||' public mirror SQL assertions' as result from mirror_test.checks;
rollback;
