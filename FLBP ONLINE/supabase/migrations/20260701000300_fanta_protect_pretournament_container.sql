-- Keep the technical pre-tournament container from being removed by broad
-- normalized-sync cleanup. fanta_teams references tournaments with ON DELETE
-- CASCADE, so deleting "__pre_tournament__" would wipe saved Fanta rosters.

insert into public.tournaments (
  workspace_id,
  id,
  name,
  start_date,
  type,
  config,
  is_manual,
  status,
  updated_at
)
values (
  'default',
  '__pre_tournament__',
  'Pretorneo',
  now(),
  'elimination',
  '{"fantaPreTournament": true}'::jsonb,
  true,
  'live',
  now()
)
on conflict (workspace_id, id) do update set
  name = excluded.name,
  config = excluded.config,
  is_manual = true,
  status = 'live',
  updated_at = now();

create or replace function public.flbp_keep_fanta_pretournament_container()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.id = '__pre_tournament__' then
    return null;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_keep_fanta_pretournament_container on public.tournaments;
create trigger trg_keep_fanta_pretournament_container
before delete on public.tournaments
for each row
execute function public.flbp_keep_fanta_pretournament_container();
