-- Explicit bracket successor links.
-- Additive and backward-compatible: old rows without links keep working through
-- the app-side positional fallback until this backfill runs.

alter table if exists public.tournament_matches
  add column if not exists next_match_id text;

alter table if exists public.tournament_matches
  add column if not exists next_slot text;

alter table if exists public.public_tournament_matches
  add column if not exists next_match_id text;

alter table if exists public.public_tournament_matches
  add column if not exists next_slot text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournament_matches_next_slot_check'
      and conrelid = 'public.tournament_matches'::regclass
  ) then
    alter table public.tournament_matches
      add constraint tournament_matches_next_slot_check
      check (next_slot is null or next_slot in ('A', 'B'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'public_tournament_matches_next_slot_check'
      and conrelid = 'public.public_tournament_matches'::regclass
  ) then
    alter table public.public_tournament_matches
      add constraint public_tournament_matches_next_slot_check
      check (next_slot is null or next_slot in ('A', 'B'));
  end if;
end $$;

create index if not exists idx_matches_next
  on public.tournament_matches(workspace_id, tournament_id, next_match_id)
  where next_match_id is not null;

create index if not exists idx_public_matches_next
  on public.public_tournament_matches(workspace_id, tournament_id, next_match_id)
  where next_match_id is not null;

-- Backfill normalized matches by the legacy positional rule:
-- round N match index i feeds round N+1 match floor(i/2), slot A for even i, B for odd i.
with ranked as (
  select
    workspace_id,
    tournament_id,
    id,
    round,
    row_number() over (
      partition by workspace_id, tournament_id, round
      order by order_index nulls last, code nulls last, id
    ) - 1 as idx
  from public.tournament_matches
  where phase = 'bracket'
),
links as (
  select
    cur.workspace_id,
    cur.tournament_id,
    cur.id,
    nxt.id as next_match_id,
    case when mod(cur.idx, 2) = 0 then 'A' else 'B' end as next_slot
  from ranked cur
  join ranked nxt
    on nxt.workspace_id = cur.workspace_id
   and nxt.tournament_id = cur.tournament_id
   and nxt.round = cur.round + 1
   and nxt.idx = floor(cur.idx / 2.0)::int
)
update public.tournament_matches m
set
  next_match_id = links.next_match_id,
  next_slot = links.next_slot
from links
where m.workspace_id = links.workspace_id
  and m.tournament_id = links.tournament_id
  and m.id = links.id
  and (
    m.next_match_id is distinct from links.next_match_id
    or m.next_slot is distinct from links.next_slot
  );

-- Final-round rows have no successor.
update public.tournament_matches m
set next_match_id = null, next_slot = null
where m.phase = 'bracket'
  and not exists (
    select 1
    from public.tournament_matches n
    where n.workspace_id = m.workspace_id
      and n.tournament_id = m.tournament_id
      and n.phase = 'bracket'
      and n.round = m.round + 1
  )
  and (m.next_match_id is not null or m.next_slot is not null);

-- Mirror the same links into the public read model when corresponding rows exist.
update public.public_tournament_matches pm
set
  next_match_id = m.next_match_id,
  next_slot = m.next_slot
from public.tournament_matches m
where pm.workspace_id = m.workspace_id
  and pm.tournament_id = m.tournament_id
  and pm.id = m.id
  and (
    pm.next_match_id is distinct from m.next_match_id
    or pm.next_slot is distinct from m.next_slot
  );
