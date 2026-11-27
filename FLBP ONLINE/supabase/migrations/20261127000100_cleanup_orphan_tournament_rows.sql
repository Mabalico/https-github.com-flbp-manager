-- Removes private tournament rows that no part of the app uses any more:
-- leftovers of cancelled or deleted tournaments (trial and simulated ones too).
-- A row is removed only when it is not the live tournament nor in the history
-- of workspace_state, is not published, has no teams, groups, matches or Fanta
-- teams, and has not been touched for at least a day (a tournament being set up
-- right now is never removed). Cancelled tournaments no longer leave rows since
-- 20261124000200_fanta_return_cancelled_live.sql.

create or replace function public.flbp_cleanup_orphan_tournament_rows(
  p_workspace_id text,
  p_min_age interval default interval '1 day'
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_state jsonb;
  v_count integer := 0;
begin
  select ws.state into v_state
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id;
  -- Without the authoritative state nothing can be told apart: keep everything.
  if v_state is null then return 0; end if;

  delete from public.tournaments t
  where t.workspace_id = v_workspace_id
    and t.id <> '__pre_tournament__'
    and coalesce(t.updated_at, t.created_at, now()) < now() - coalesce(p_min_age, interval '1 day')
    and t.id is distinct from (v_state -> 'tournament' ->> 'id')
    and not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(v_state -> 'tournamentHistory') = 'array' then v_state -> 'tournamentHistory' else '[]'::jsonb end
      ) h
      where h ->> 'id' = t.id
    )
    and not exists (select 1 from public.public_tournaments p where p.workspace_id = t.workspace_id and p.id = t.id)
    and not exists (select 1 from public.tournament_teams x where x.workspace_id = t.workspace_id and x.tournament_id = t.id)
    and not exists (select 1 from public.tournament_groups x where x.workspace_id = t.workspace_id and x.tournament_id = t.id)
    and not exists (select 1 from public.tournament_matches x where x.workspace_id = t.workspace_id and x.tournament_id = t.id)
    and not exists (select 1 from public.fanta_teams x where x.workspace_id = t.workspace_id and x.tournament_id = t.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.flbp_cleanup_orphan_tournament_rows(text, interval) from public, anon, authenticated;

do $$
declare
  v_workspace text;
  v_removed integer;
begin
  for v_workspace in select workspace_id from public.workspace_state loop
    v_removed := public.flbp_cleanup_orphan_tournament_rows(v_workspace);
    raise notice 'Workspace %: % righe di tornei non usate eliminate', v_workspace, v_removed;
  end loop;
end;
$$;
