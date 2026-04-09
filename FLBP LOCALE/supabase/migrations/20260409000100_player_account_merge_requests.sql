create table if not exists public.player_account_merge_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  requester_user_id uuid null,
  requester_email text not null,
  requester_first_name text not null,
  requester_last_name text not null,
  requester_birth_date date not null,
  requester_canonical_player_id text null,
  requester_canonical_player_name text null,
  candidate_player_id text not null,
  candidate_player_name text not null,
  candidate_birth_date date null,
  comment text null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by_user_id uuid null
);

create index if not exists idx_player_account_merge_requests_workspace_status
  on public.player_account_merge_requests(workspace_id, status, created_at desc);

create index if not exists idx_player_account_merge_requests_candidate
  on public.player_account_merge_requests(workspace_id, candidate_player_id, created_at desc);

create index if not exists idx_player_account_merge_requests_requester
  on public.player_account_merge_requests(workspace_id, requester_user_id, created_at desc);

alter table public.player_account_merge_requests enable row level security;

drop policy if exists player_account_merge_requests_admin_all on public.player_account_merge_requests;
create policy player_account_merge_requests_admin_all on public.player_account_merge_requests
  for all
  to authenticated
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

grant select, insert, update, delete on public.player_account_merge_requests to authenticated;
