-- Make pre-tournament Fanta roster sync resilient for rosters saved before
-- real_team_slot existed. Admin team edits now send previous slot players too,
-- so the RPC can update the correct roster row instead of losing context.

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
  v_effective_slot text;
  v_player_changed boolean;
  v_team_exists boolean;
  v_eligible_team_count int := 0;
  v_candidate record;
  v_updated int := 0;
  v_deferred int := 0;
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

  for v_roster in
    select
      r.id,
      r.team_id as fanta_team_id,
      r.player_id,
      r.player_name,
      r.real_team_id,
      r.real_team_name,
      r.real_team_slot,
      ft.user_id
    from public.fanta_rosters r
    join public.fanta_teams ft on ft.id = r.team_id
    where ft.workspace_id = p_workspace_id
      and ft.tournament_id = '__pre_tournament__'
  loop
    v_slot_player_id := null;
    v_slot_player_name := null;
    v_slot_team_name := null;
    v_effective_slot := null;
    v_player_changed := false;
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
      into v_team_exists;

      if v_team_exists then
        select
          case
            when v_roster.real_team_slot in ('player1', 'player2') then v_roster.real_team_slot
            when coalesce(v_roster.player_id, '') <> '' and (
              coalesce(v_roster.player_id, '') = coalesce(nullif(team.player1_id, ''), '')
              or coalesce(v_roster.player_id, '') = coalesce(nullif(team.previous_player1_id, ''), '')
            ) then 'player1'
            when lower(btrim(coalesce(v_roster.player_name, ''))) <> '' and (
              lower(btrim(coalesce(v_roster.player_name, ''))) = lower(btrim(coalesce(nullif(team.player1_name, ''), '')))
              or lower(btrim(coalesce(v_roster.player_name, ''))) = lower(btrim(coalesce(nullif(team.previous_player1_name, ''), '')))
            ) then 'player1'
            when coalesce(v_roster.player_id, '') <> '' and (
              coalesce(v_roster.player_id, '') = coalesce(nullif(team.player2_id, ''), '')
              or coalesce(v_roster.player_id, '') = coalesce(nullif(team.previous_player2_id, ''), '')
            ) then 'player2'
            when lower(btrim(coalesce(v_roster.player_name, ''))) <> '' and (
              lower(btrim(coalesce(v_roster.player_name, ''))) = lower(btrim(coalesce(nullif(team.player2_name, ''), '')))
              or lower(btrim(coalesce(v_roster.player_name, ''))) = lower(btrim(coalesce(nullif(team.previous_player2_name, ''), '')))
            ) then 'player2'
            else null
          end
        into v_effective_slot
        from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
          team_id text,
          team_name text,
          player1_id text,
          player1_name text,
          player2_id text,
          player2_name text,
          previous_player1_id text,
          previous_player1_name text,
          previous_player2_id text,
          previous_player2_name text,
          hidden boolean,
          is_bye boolean
        )
        where team.team_id = v_roster.real_team_id
          and coalesce(team.hidden, false) = false
          and coalesce(team.is_bye, false) = false
        limit 1;

        if v_effective_slot in ('player1', 'player2') then
          select
            case when v_effective_slot = 'player1' then nullif(team.player1_id, '') else nullif(team.player2_id, '') end,
            case when v_effective_slot = 'player1' then nullif(team.player1_name, '') else nullif(team.player2_name, '') end,
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
    end if;

    if v_slot_player_id is not null
      and v_slot_player_name is not null
      and (
        v_slot_player_id = coalesce(v_roster.player_id, '')
        or not exists (
          select 1 from public.fanta_rosters other
          where other.team_id = v_roster.fanta_team_id
            and other.id <> v_roster.id
            and other.player_id = v_slot_player_id
        )
      )
      and (
        v_slot_player_id <> coalesce(v_roster.player_id, '')
        or v_slot_player_name <> coalesce(v_roster.player_name, '')
        or coalesce(v_roster.real_team_slot, '') <> coalesce(v_effective_slot, '')
        or coalesce(v_roster.real_team_name, '') <> coalesce(v_slot_team_name, v_roster.real_team_name, '')
      )
    then
      v_player_changed := v_slot_player_id <> coalesce(v_roster.player_id, '')
        or v_slot_player_name <> coalesce(v_roster.player_name, '');

      update public.fanta_rosters
      set player_id = v_slot_player_id,
          player_name = v_slot_player_name,
          real_team_name = coalesce(v_slot_team_name, real_team_name),
          real_team_slot = v_effective_slot
      where id = v_roster.id;

      if v_player_changed then
        insert into public.fanta_roster_change_notices (
          workspace_id, user_id, fanta_team_id, old_player_id, old_player_name, new_player_id, new_player_name, reason
        ) values (
          p_workspace_id, v_roster.user_id, v_roster.fanta_team_id, v_roster.player_id, coalesce(v_roster.player_name, 'Giocatore precedente'),
          v_slot_player_id, v_slot_player_name, 'team_player_changed'
        );
        v_updated := v_updated + 1;
      end if;
    elsif coalesce(v_team_exists, false) = false and v_eligible_team_count >= 4 then
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
