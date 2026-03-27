-- FLBP Manager Suite - Admin Auth roles for public deploy
--
-- Goals:
-- - Require Supabase Auth for Admin entry in the public frontend.
-- - Authorize remote admin reads/writes via Supabase Auth + RLS.
-- - Keep compatibility with old JWT metadata role checks, but prefer a real admin table.
--
-- Manual bootstrap after running this migration:
-- 1) Create the auth user in Supabase Auth (email/password).
-- 2) Insert the corresponding auth.users.id into public.admin_users.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

grant select on public.admin_users to authenticated;

drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.flbp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (auth.role() = 'service_role')
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
    )
    or (auth.jwt() ->> 'role' = 'admin')
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    or ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
$$;

grant execute on function public.flbp_is_admin() to anon, authenticated;
