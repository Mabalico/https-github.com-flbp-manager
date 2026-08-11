-- Keep the frequently read live row compact even when a legacy/full backup
-- path supplies the complete public workspace snapshot.
create or replace function public.flbp_public_workspace_live_compact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.state := public.flbp_build_public_workspace_live_state(coalesce(new.state, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists flbp_public_workspace_live_compact on public.public_workspace_live;
create trigger flbp_public_workspace_live_compact
before insert or update on public.public_workspace_live
for each row execute function public.flbp_public_workspace_live_compact();

revoke all on function public.flbp_public_workspace_live_compact() from public, anon, authenticated;
