create table if not exists public.public_site_views_daily (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  view_date date not null,
  views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, view_date)
);

create index if not exists idx_public_site_views_daily_workspace_date
  on public.public_site_views_daily(workspace_id, view_date desc);

alter table public.public_site_views_daily enable row level security;

drop policy if exists "public_site_views_daily_select" on public.public_site_views_daily;
create policy "public_site_views_daily_select"
  on public.public_site_views_daily
  for select
  using (true);

drop policy if exists "public_site_views_daily_admin_write" on public.public_site_views_daily;
create policy "public_site_views_daily_admin_write"
  on public.public_site_views_daily
  for all
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

grant select on public.public_site_views_daily to anon, authenticated;
grant insert, update, delete on public.public_site_views_daily to authenticated;

create or replace function public.flbp_track_site_view(
  p_workspace_id text,
  p_view_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_view_date date := coalesce(p_view_date, (now() at time zone 'utc')::date);
  v_views bigint;
begin
  insert into public.public_site_views_daily (workspace_id, view_date, views, created_at, updated_at)
  values (p_workspace_id, v_view_date, 1, now(), now())
  on conflict (workspace_id, view_date) do update
  set views = public.public_site_views_daily.views + 1,
      updated_at = now()
  returning views into v_views;

  return jsonb_build_object(
    'ok', true,
    'view_date', v_view_date,
    'views', v_views
  );
end;
$$;

grant execute on function public.flbp_track_site_view(text, date) to anon, authenticated;
