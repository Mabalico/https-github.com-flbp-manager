-- Disposable full-schema PostgreSQL only. No fixture escapes this transaction.
begin;
create schema fanta_order_test;
create table fanta_order_test.checks(label text);
create function fanta_order_test.check(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Fanta archive order assertion failed: %',p_label; end if;
  insert into fanta_order_test.checks values(p_label);
end;
$$;
create function fanta_order_test.archive_rows(p_workspace text) returns jsonb language sql as $$
  select jsonb_build_object(
    'editions',(select jsonb_agg(to_jsonb(e)-'archived_at'-'updated_at' order by tournament_id) from public.fanta_archived_editions e where workspace_id=p_workspace),
    'standings',(select jsonb_agg(to_jsonb(s)-'archived_at'-'updated_at'-'created_at' order by team_id) from public.fanta_archived_standings s where workspace_id=p_workspace),
    'rosters',(select jsonb_agg(to_jsonb(r)-'archived_at'-'updated_at'-'created_at' order by team_id,player_id) from public.fanta_archived_rosters r where workspace_id=p_workspace),
    'players',(select jsonb_agg(to_jsonb(p)-'archived_at'-'updated_at'-'created_at' order by player_id) from public.fanta_archived_players p where workspace_id=p_workspace)
  );
$$;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"admin"}}',true);
do $$
declare
  v_mode text; v_workspace text; v_old jsonb; v_new jsonb; v_baseline jsonb; v_out jsonb;
  v_base timestamptz; v_roster_id uuid; v_user_id uuid;
begin
  foreach v_mode in array array['v2','legacy','local-normalized'] loop
    v_workspace:='fanta-order-'||v_mode;
    insert into public.workspaces(id) values(v_workspace);
    v_old:='{
      "teams":[
        {"id":"a","name":"A","player1":"Alice","player2":"Amy","createdAt":1767225600000},
        {"id":"b","name":"B","player1":"Bob","player2":"Ben","createdAt":1767225600000}],
      "tournament":{"id":"prior","name":"Prior edition","startDate":"2026-01-01T00:00:00Z","type":"elimination","config":{},"teams":[]},
      "tournamentMatches":[{"id":"final","teamAId":"a","teamBId":"b","phase":"bracket","round":1,"code":"F1",
        "scoreA":10,"scoreB":4,"status":"finished","played":true,
        "stats":[{"teamId":"a","playerName":"Alice","canestri":6,"soffi":2},{"teamId":"b","playerName":"Bob","canestri":4,"soffi":1}]}],
      "tournamentHistory":[],"hallOfFame":[]}'::jsonb;
    v_old:=jsonb_set(v_old,'{tournament,teams}',v_old->'teams');
    insert into public.workspace_state(workspace_id,state,updated_at) values(v_workspace,v_old,'2026-01-01T00:00:00Z');
    insert into public.public_workspace_state(workspace_id,state) values(v_workspace,v_old);
    perform public.flbp_local_sync_live_normalized_internal(v_workspace,v_old);
    v_user_id:=gen_random_uuid();
    insert into auth.users(id,email) values(v_user_id,v_workspace||'@example.invalid');
    insert into public.fanta_teams(workspace_id,tournament_id,user_id,name,status)
      values(v_workspace,'prior',v_user_id,'Fixture Fanta','confirmed') returning id into v_roster_id;
    insert into public.fanta_rosters(team_id,player_id,player_name,real_team_id,real_team_name,role) values
      (v_roster_id,'fixture-alice','Alice','a','A','captain'),(v_roster_id,'fixture-bob','Bob','b','B','defender');
    perform fanta_order_test.check((select count(*)=2 and sum(raw_goals)=10 and sum(raw_blows)=3 from public.fanta_roster_live_rows where workspace_id=v_workspace),v_mode||': real scoring source has nonzero cups/blows and both players');
    execute 'set local role authenticated';
    v_out:=public.flbp_archive_fanta_tournament(v_workspace,'prior');
    execute 'reset role';
    perform fanta_order_test.check((v_out->>'roster_count')::int=2,v_mode||': existing public archive RPC captures both roster rows');
    v_baseline:=fanta_order_test.archive_rows(v_workspace);
    perform fanta_order_test.check((v_baseline#>>'{standings,0,total_points}')::int>20,v_mode||': archive baseline includes nonzero weighted scoring');
    delete from public.fanta_archived_editions where workspace_id=v_workspace;
    -- Start-live archives old matches in canonical history before replacing live.
    v_new:=jsonb_set(v_old,'{tournamentHistory}',jsonb_build_array((v_old->'tournament')||jsonb_build_object('matches',v_old->'tournamentMatches')));
    v_new:=jsonb_set(v_new,'{tournament}',(v_old->'tournament')||'{"id":"next","name":"Next edition"}'::jsonb);
    v_new:=jsonb_set(v_new,'{tournamentMatches}','[]');
    select updated_at into v_base from public.workspace_state where workspace_id=v_workspace;
    -- A rejected canonical transition must not publish the archive itself.
    begin
      execute 'set local role authenticated';
      if v_mode='legacy' then
        perform public.flbp_admin_push_workspace_state(v_workspace,v_new,v_new,v_base-interval '1 day',false,null);
      else
        perform public.flbp_admin_push_workspace_state_v2(v_workspace,v_new,v_new,v_base-interval '1 day',false,null,v_workspace||'-rejected');
      end if;
      raise exception 'Expected canonical conflict';
    exception when raise_exception then
      if sqlerrm not like 'FLBP_DB_CONFLICT:%' then raise; end if;
    end;
    execute 'reset role';
    perform fanta_order_test.check(not exists(select 1 from public.fanta_archived_editions where workspace_id=v_workspace)
      and (select state#>>'{tournament,id}'='prior' from public.workspace_state where workspace_id=v_workspace),v_mode||': rejected canonical transition leaves previous live edition unarchived');
    execute 'set local role authenticated';
    if v_mode='legacy' then
      v_out:=public.flbp_admin_push_workspace_state(v_workspace,v_new,v_new,v_base,false,null);
    else
      v_out:=public.flbp_admin_push_workspace_state_v2(v_workspace,v_new,v_new,v_base,false,null,v_workspace||'-accepted');
    end if;
    execute 'reset role';
    perform fanta_order_test.check((v_out->>'ok')::boolean and (select state#>>'{tournament,id}'='next' from public.workspace_state where workspace_id=v_workspace),v_mode||': actual canonical RPC confirms the next live edition');
    perform fanta_order_test.check(not exists(select 1 from public.fanta_archived_editions where workspace_id=v_workspace)
      and (select count(*)=2 and sum(raw_goals)=10 and sum(raw_blows)=3 from public.fanta_roster_live_rows where workspace_id=v_workspace),v_mode||': canonical commit preserves the previous scoring/roster source');
    if v_mode='local-normalized' then
      -- Local outbox may finish before its HTTP commit response: execute the
      -- actual full-normalizer branch selected by tournamentHistory patches.
      v_out:=public.flbp_local_sync_full_normalized_internal(v_workspace,v_new);
      perform fanta_order_test.check((v_out->>'fanta_archives')::int=1 and fanta_order_test.archive_rows(v_workspace)=v_baseline,
        'local-normalized: early outbox normalization already captures the complete old archive');
    end if;
    execute 'set local role authenticated';
    v_out:=public.flbp_archive_fanta_tournament(v_workspace,'prior');
    execute 'reset role';
    perform fanta_order_test.check((v_out->>'ok')::boolean and fanta_order_test.archive_rows(v_workspace)=v_baseline,
      v_mode||': postcommit snapshot exactly preserves edition, standings, players and roster values');
  end loop;
end;
$$;
-- Rosters are written only through the RPCs and never publish a birth date.
do $$
declare v_user uuid := gen_random_uuid(); v_team uuid; v_denied boolean := false;
begin
  perform fanta_order_test.check(
    not has_table_privilege('anon','public.fanta_teams','INSERT, UPDATE, DELETE')
    and not has_table_privilege('anon','public.fanta_rosters','INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated','public.fanta_teams','INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated','public.fanta_rosters','INSERT, UPDATE, DELETE')
    and has_table_privilege('anon','public.fanta_teams','SELECT') and has_table_privilege('anon','public.fanta_rosters','SELECT'),
    'Fanta teams and rosters stay publicly readable but are not directly writable by client roles');
  insert into public.workspaces(id) values('fanta-order-privacy');
  insert into auth.users(id,email) values(v_user,'fanta-order-privacy@example.invalid');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_user)::text,true);
  execute 'set local role authenticated';
  v_team:=public.fanta_save_team('fanta-order-privacy','__pre_tournament__','Privacy Fanta','[
    {"player_id":"anna_2009-04-01","player_name":"Anna","real_team_id":"a","real_team_name":"A","real_team_slot":"player1","role":"captain"},
    {"player_id":"bea_ND","player_name":"Bea","real_team_id":"a","real_team_name":"A","real_team_slot":"player2","role":"defender"},
    {"player_id":"carla_ND","player_name":"Carla","real_team_id":"b","real_team_name":"B","real_team_slot":"player1","role":"defender"},
    {"player_id":"dora_ND","player_name":"Dora","real_team_id":"b","real_team_name":"B","real_team_slot":"player2","role":"starter"}]');
  begin
    update public.fanta_rosters set role='starter' where team_id=v_team and role='captain';
  exception when insufficient_privilege then v_denied:=true;
  end;
  execute 'reset role';
  perform fanta_order_test.check(v_team is not null and (select count(*)=4 from public.fanta_rosters where team_id=v_team),
    'fanta_save_team still saves the owner roster after the direct grants are revoked');
  perform fanta_order_test.check(v_denied and (select count(*)=1 from public.fanta_rosters where team_id=v_team and role='captain'),
    'the owner cannot PATCH their roster around fanta_save_team');
  perform fanta_order_test.check(exists(select 1 from public.fanta_rosters where team_id=v_team and player_id='anna_ND')
    and not exists(select 1 from public.fanta_rosters where player_id ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}')
    and not exists(select 1 from public.fanta_roster_live_rows where player_id ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'),
    'a birth-date player key is stored and published as the builder name_ND key');
  insert into public.fanta_archived_editions(workspace_id,tournament_id,tournament_name) values('fanta-order-privacy','archived-privacy','Archived privacy');
  insert into public.fanta_archived_players(workspace_id,tournament_id,player_id,rank,player_name)
    values('fanta-order-privacy','archived-privacy','anna_2009-04-01',1,'Anna');
  insert into public.fanta_archived_rosters(workspace_id,tournament_id,team_id,team_name,player_id,player_name)
    values('fanta-order-privacy','archived-privacy',v_team,'Privacy Fanta','anna_2009-04-01','Anna');
  perform fanta_order_test.check((select player_id='anna_ND' from public.fanta_archived_players where workspace_id='fanta-order-privacy')
    and (select player_id='anna_ND' from public.fanta_archived_rosters where workspace_id='fanta-order-privacy')
    and public.flbp_fanta_public_player_id('fixture-alice')='fixture-alice',
    'archived Fanta players and rosters never store a birth date; other ids are untouched');
end;
$$;
select 'PASS: '||label from fanta_order_test.checks;
rollback;
