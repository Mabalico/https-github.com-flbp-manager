-- FLBP Manager Suite - post-rollout verification
-- Run after 20260402_player_referee_additive_rollout.sql

select 'function: flbp_referee_pull_live_state' as check_name,
       to_regprocedure('public.flbp_referee_pull_live_state(text,text,text)') is not null as ok;

select 'table: player_app_profiles' as check_name,
       to_regclass('public.player_app_profiles') is not null as ok;

select 'table: player_app_devices' as check_name,
       to_regclass('public.player_app_devices') is not null as ok;

select 'table: player_app_calls' as check_name,
       to_regclass('public.player_app_calls') is not null as ok;

select 'function: flbp_player_call_team' as check_name,
       to_regprocedure('public.flbp_player_call_team(text,text,text,text,uuid,text,text)') is not null as ok;

select 'function: flbp_player_ack_call' as check_name,
       to_regprocedure('public.flbp_player_ack_call(text,text)') is not null as ok;

select 'function: flbp_player_cancel_call' as check_name,
       to_regprocedure('public.flbp_player_cancel_call(text,text)') is not null as ok;

select 'function: flbp_admin_list_player_accounts' as check_name,
       to_regprocedure('public.flbp_admin_list_player_accounts(text,text)') is not null as ok;

select 'policies: player_app_profiles' as check_name,
       count(*)::int as policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'player_app_profiles';

select 'policies: player_app_devices' as check_name,
       count(*)::int as policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'player_app_devices';

select 'policies: player_app_calls' as check_name,
       count(*)::int as policy_count
from pg_policies
where schemaname = 'public'
  and tablename = 'player_app_calls';

select 'sample: account_catalog_callable' as check_name,
       count(*) >= 0 as ok
from public.flbp_admin_list_player_accounts('default', null);
