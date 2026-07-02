-- Public owner labels for Fanta teams.
--
-- The Fanta standings are public, but player_app_profiles is protected by RLS.
-- This narrow projection exposes only the display label needed to identify who
-- owns a Fanta team, without opening the full player profile table.

create or replace view public.fanta_team_owner_labels as
select
  t.workspace_id,
  t.tournament_id,
  t.id as team_id,
  t.user_id,
  coalesce(
    nullif(
      trim(concat_ws(' ', nullif(p.first_name, ''), nullif(p.last_name, ''))),
      ''
    ),
    nullif(p.canonical_player_name, ''),
    'Utente ' || upper(substr(t.user_id::text, 1, 8))
  ) as owner_name
from public.fanta_teams t
left join public.player_app_profiles p
  on p.workspace_id = t.workspace_id
 and p.user_id = t.user_id;

grant select on public.fanta_team_owner_labels to anon, authenticated;
