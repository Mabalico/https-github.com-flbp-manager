-- Bounded retention for the cloud version history.
--
-- Every cloud write stores a complete workspace state in
-- workspace_state_versions (flbp_workspace_state_capture_version). Only the
-- local tournament server pruned that table, and only while local mode was
-- active, so in normal cloud use it grew without limit.
--
-- Policy: a version is removed only when it is
-- - older than 30 days, and
-- - outside the 200 most recent versions of its workspace, and
-- - not the version of the current workspace_state operation.
-- Each new version removes at most 50 eligible rows. An existing backlog
-- drains gradually over the next writes instead of slowing a single write or
-- this migration. Cloud writers are already serialized per workspace by the
-- data-plane advisory lock in flbp_workspace_state_before_write.

create or replace function public.flbp_prune_workspace_state_versions(
  p_workspace_id text,
  p_keep_days integer default 30,
  p_keep_latest integer default 200,
  p_batch integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep_days integer := greatest(7, least(coalesce(p_keep_days, 30), 3650));
  v_keep_latest integer := greatest(50, least(coalesce(p_keep_latest, 200), 100000));
  v_batch integer := greatest(1, least(coalesce(p_batch, 50), 5000));
  v_deleted integer := 0;
begin
  with recent as (
    select id
    from public.workspace_state_versions
    where workspace_id = p_workspace_id
    order by version desc, id desc
    limit v_keep_latest
  ), doomed as (
    select v.id
    from public.workspace_state_versions v
    where v.workspace_id = p_workspace_id
      and v.created_at < now() - make_interval(days => v_keep_days)
      and not exists (select 1 from recent where recent.id = v.id)
      and not exists (
        select 1 from public.workspace_state current_state
        where current_state.workspace_id = v.workspace_id
          and current_state.last_operation_id is not distinct from v.operation_id
      )
    order by v.version asc, v.id asc
    limit v_batch
  ), deleted as (
    delete from public.workspace_state_versions versions
    using doomed
    where versions.id = doomed.id
    returning 1
  )
  select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.flbp_prune_workspace_state_versions(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.flbp_prune_workspace_state_versions(text, integer, integer, integer) to service_role;

create or replace function public.flbp_workspace_state_versions_retention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.flbp_prune_workspace_state_versions(new.workspace_id);
  return null;
end;
$$;

revoke all on function public.flbp_workspace_state_versions_retention() from public, anon, authenticated;

drop trigger if exists flbp_workspace_state_versions_retention on public.workspace_state_versions;
create trigger flbp_workspace_state_versions_retention
after insert on public.workspace_state_versions
for each row execute function public.flbp_workspace_state_versions_retention();
