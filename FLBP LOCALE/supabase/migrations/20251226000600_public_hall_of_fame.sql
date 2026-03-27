-- Public (sanitized) Hall of Fame mirror
-- Safe for public/TV: NO YoB and no internal player keys.

create table if not exists public_hall_of_fame_entries (
  workspace_id text not null references workspaces(id) on delete cascade,
  id text not null,

  year text not null,
  tournament_id text not null,
  tournament_name text not null,
  type text not null check (
    type in ('winner','top_scorer','defender','mvp','top_scorer_u25','defender_u25')
  ),
  team_name text null,
  player_names text[] not null default '{}'::text[],
  value int null,
  created_at timestamptz not null default now(),

  primary key (workspace_id, id)
);

create index if not exists idx_public_hof_by_tournament
  on public_hall_of_fame_entries(workspace_id, tournament_id);

create index if not exists idx_public_hof_by_type_year
  on public_hall_of_fame_entries(workspace_id, type, year desc);

alter table public_hall_of_fame_entries enable row level security;

drop policy if exists "public_hof_select" on public_hall_of_fame_entries;
create policy "public_hof_select"
  on public_hall_of_fame_entries
  for select
  using (true);

drop policy if exists "public_hof_admin_write" on public_hall_of_fame_entries;
create policy "public_hof_admin_write"
  on public_hall_of_fame_entries
  for all
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());
