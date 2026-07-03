-- Extend fanta_sync_pretournament_rosters to also follow team-slot player
-- substitutions into the LIVE tournament during the open market window
-- (bracket already generated, but the first match has NOT started yet).
--
-- Rules:
-- - Pretorneo ("__pre_tournament__") rosters: unchanged behaviour, including the
--   random replacement when a real team is removed.
-- - Live tournament rosters: ONLY the direct slot swap (case A) is applied, and
--   ONLY while the tournament has no played/playing non-bye/non-hidden match.
--   The random replacement (case B) stays pretorneo-only on purpose: during a
--   live tournament we never reshuffle a user's Fanta pick at random.
-- - The lock is enforced server-side (started check) so a stale client cannot
--   force a swap after the first match.
-- - When there is no editable live tournament, the loop reduces to the exact
--   pretorneo-only set, so existing behaviour is byte-for-byte preserved.

create or replace function public.fanta_sync_pretournament_rosters(
  p_workspace_id text,
  p_teams jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roster record;
  v_slot_player_id text;
  v_slot_player_name text;
  v_slot_team_name text;
  v_team_exists boolean;
  v_eligible_team_count int := 0;
  v_candidate record;
  v_updated int := 0;
  v_deferred int := 0;
  -- Live open-window support
  v_config_tournament_id text;
  v_live_tournament_id text;
  v_live_started boolean := false;
begin
  if not public.flbp_is_admin() then
    raise exception 'Admin access required.';
  end if;

  if jsonb_typeof(coalesce(p_teams, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid pre-tournament team payload.';
  end if;

  select count(*)
  into v_eligible_team_count
  from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
    team_id text,
    team_name text,
    player1_id text,
    player1_name text,
    player2_id text,
    player2_name text,
    hidden boolean,
    is_bye boolean
  )
  where coalesce(hidden, false) = false
    and coalesce(is_bye, false) = false
    and (coalesce(nullif(player1_name, ''), '') <> '' or coalesce(nullif(player2_name, ''), '') <> '');

  -- Resolve the live tournament whose Fanta rosters are still editable.
  -- fanta_config points at it after promotion; only treat it as editable while
  -- it is a real live tournament that has not started.
  select c.active_tournament_id
  into v_config_tournament_id
  from public.fanta_config c
  where c.workspace_id = p_workspace_id;

  v_live_tournament_id := nullif(v_config_tournament_id, '__pre_tournament__');

  if v_live_tournament_id is not null then
    if not exists (
      select 1 from public.tournaments
      where workspace_id = p_workspace_id and id = v_live_tournament_id and status = 'live'
    ) and not exists (
      select 1 from public.public_tournaments
      where workspace_id = p_workspace_id and id = v_live_tournament_id and status = 'live'
    ) then
      -- Archived / deleted / not live: never touch those rosters here.
      v_live_tournament_id := null;
    end if;
  end if;

  if v_live_tournament_id is not null then
    select (
      exists (
        select 1 from public.tournament_matches
        where workspace_id = p_workspace_id
          and tournament_id = v_live_tournament_id
          and hidden = false
          and is_bye = false
          and (played = true or status = 'playing')
        limit 1
      )
      or exists (
        select 1 from public.public_tournament_matches
        where workspace_id = p_workspace_id
          and tournament_id = v_live_tournament_id
          and hidden = false
          and is_bye = false
          and (played = true or status = 'playing')
        limit 1
      )
    ) into v_live_started;

    if v_live_started then
      -- Market locked: freeze live rosters, mirror the fanta_save_team lock.
      v_live_tournament_id := null;
    end if;
  end if;

  for v_roster in
    select
      r.id,
      r.team_id as fanta_team_id,
      r.player_id,
      r.player_name,
      r.real_team_id,
      r.real_team_name,
      r.real_team_slot,
      ft.user_id,
      ft.tournament_id as owner_tournament_id
    from public.fanta_rosters r
    join public.fanta_teams ft on ft.id = r.team_id
    where ft.workspace_id = p_workspace_id
      and (
        ft.tournament_id = '__pre_tournament__'
        or (v_live_tournament_id is not null and ft.tournament_id = v_live_tournament_id)
      )
  loop
    v_slot_player_id := null;
    v_slot_player_name := null;
    v_slot_team_name := null;
    v_team_exists := false;

    if coalesce(v_roster.real_team_id, '') <> '' then
      select exists (
        select 1
        from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
          team_id text,
          team_name text,
          player1_id text,
          player1_name text,
          player2_id text,
          player2_name text,
          hidden boolean,
          is_bye boolean
        )
        where team.team_id = v_roster.real_team_id
          and coalesce(team.hidden, false) = false
          and coalesce(team.is_bye, false) = false
        limit 1
      )
      into v_team_exists
      ;

      if v_team_exists and v_roster.real_team_slot in ('player1', 'player2') then
        select
          case when v_roster.real_team_slot = 'player1' then nullif(team.player1_id, '') else nullif(team.player2_id, '') end,
          case when v_roster.real_team_slot = 'player1' then nullif(team.player1_name, '') else nullif(team.player2_name, '') end,
          nullif(team.team_name, '')
        into v_slot_player_id, v_slot_player_name, v_slot_team_name
        from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
          team_id text,
          team_name text,
          player1_id text,
          player1_name text,
          player2_id text,
          player2_name text,
          hidden boolean,
          is_bye boolean
        )
        where team.team_id = v_roster.real_team_id
          and coalesce(team.hidden, false) = false
          and coalesce(team.is_bye, false) = false
        limit 1;
      end if;
    end if;

    if v_slot_player_id is not null
      and v_slot_player_name is not null
      and v_slot_player_id <> coalesce(v_roster.player_id, '')
      and not exists (
        select 1 from public.fanta_rosters other
        where other.team_id = v_roster.fanta_team_id
          and other.id <> v_roster.id
          and other.player_id = v_slot_player_id
      )
    then
      update public.fanta_rosters
      set player_id = v_slot_player_id,
          player_name = v_slot_player_name,
          real_team_name = coalesce(v_slot_team_name, real_team_name)
      where id = v_roster.id;

      insert into public.fanta_roster_change_notices (
        workspace_id, user_id, fanta_team_id, old_player_id, old_player_name, new_player_id, new_player_name, reason
      ) values (
        p_workspace_id, v_roster.user_id, v_roster.fanta_team_id, v_roster.player_id, coalesce(v_roster.player_name, 'Giocatore precedente'),
        v_slot_player_id, v_slot_player_name, 'team_player_changed'
      );
      v_updated := v_updated + 1;
    elsif coalesce(v_team_exists, false) = false
      and v_roster.owner_tournament_id = '__pre_tournament__'
      and v_eligible_team_count >= 4 then
      select *
      into v_candidate
      from (
        select team.team_id, team.team_name, 'player1'::text as slot, team.player1_id as player_id, team.player1_name as player_name
        from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
          team_id text,
          team_name text,
          player1_id text,
          player1_name text,
          player2_id text,
          player2_name text,
          hidden boolean,
          is_bye boolean
        )
        where coalesce(team.hidden, false) = false and coalesce(team.is_bye, false) = false
        union all
        select team.team_id, team.team_name, 'player2'::text as slot, team.player2_id as player_id, team.player2_name as player_name
        from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
          team_id text,
          team_name text,
          player1_id text,
          player1_name text,
          player2_id text,
          player2_name text,
          hidden boolean,
          is_bye boolean
        )
        where coalesce(team.hidden, false) = false and coalesce(team.is_bye, false) = false
      ) candidate
      where coalesce(nullif(candidate.player_id, ''), '') <> ''
        and coalesce(nullif(candidate.player_name, ''), '') <> ''
        and not exists (
          select 1 from public.fanta_rosters other
          where other.team_id = v_roster.fanta_team_id
            and other.id <> v_roster.id
            and other.player_id = candidate.player_id
        )
      order by random()
      limit 1;

      if found and v_candidate.player_id is not null then
        update public.fanta_rosters
        set player_id = v_candidate.player_id,
            player_name = v_candidate.player_name,
            real_team_id = v_candidate.team_id,
            real_team_name = v_candidate.team_name,
            real_team_slot = v_candidate.slot
        where id = v_roster.id;

        insert into public.fanta_roster_change_notices (
          workspace_id, user_id, fanta_team_id, old_player_id, old_player_name, new_player_id, new_player_name, reason
        ) values (
          p_workspace_id, v_roster.user_id, v_roster.fanta_team_id, v_roster.player_id, coalesce(v_roster.player_name, 'Giocatore precedente'),
          v_candidate.player_id, v_candidate.player_name, 'team_removed'
        );
        v_updated := v_updated + 1;
      else
        v_deferred := v_deferred + 1;
      end if;
    elsif coalesce(v_team_exists, false) = false then
      v_deferred := v_deferred + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'deferred', v_deferred,
    'eligibleTeams', v_eligible_team_count
  );
end;
$$;

grant execute on function public.fanta_sync_pretournament_rosters(text, jsonb) to authenticated;
