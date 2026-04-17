-- Fanta rosters stay open for the live tournament until the first real match starts.
-- Legacy fanta_config lock/open flags no longer block the market.

create or replace function public.fanta_save_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_name text,
  p_roster jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_tournament_id text;
  v_config_tournament_id text;
  v_started boolean := false;
  v_count int := 0;
  v_distinct_players int := 0;
  v_captains int := 0;
  v_defenders int := 0;
  v_starters int := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(p_roster) <> 'array' then
    raise exception 'Invalid Fanta roster.';
  end if;

  select c.active_tournament_id
  into v_config_tournament_id
  from fanta_config c
  where c.workspace_id = p_workspace_id;

  v_tournament_id := nullif(p_tournament_id, '');

  if v_tournament_id is null and v_config_tournament_id is not null then
    select id into v_tournament_id
    from tournaments
    where workspace_id = p_workspace_id
      and id = v_config_tournament_id
      and status = 'live'
    limit 1;
  end if;

  if v_tournament_id is null then
    select id into v_tournament_id
    from tournaments
    where workspace_id = p_workspace_id and status = 'live'
    order by updated_at desc
    limit 1;
  end if;

  if v_tournament_id is null then
    raise exception 'No live tournament available for FantaBeerpong.';
  end if;

  if not exists (
    select 1 from tournaments
    where workspace_id = p_workspace_id
      and id = v_tournament_id
      and status = 'live'
  ) then
    raise exception 'FantaBeerpong rosters can only be saved while the tournament is live.';
  end if;

  select exists (
    select 1 from tournament_matches
    where workspace_id = p_workspace_id
      and tournament_id = v_tournament_id
      and hidden = false
      and is_bye = false
      and (played = true or status in ('playing','finished'))
    limit 1
  ) into v_started;

  if v_started then
    raise exception 'FantaBeerpong roster is locked because the first match has started.';
  end if;

  select
    count(*),
    count(distinct elem->>'player_id'),
    count(*) filter (where elem->>'role' = 'captain'),
    count(*) filter (where elem->>'role' = 'defender'),
    count(*) filter (where elem->>'role' = 'starter')
  into v_count, v_distinct_players, v_captains, v_defenders, v_starters
  from jsonb_array_elements(p_roster) elem;

  if v_count <> 4 or v_distinct_players <> 4 or v_captains <> 1 or v_defenders <> 2 or v_starters <> 1 then
    raise exception 'Fanta roster must contain 4 players, 1 captain, 2 defenders and 1 starter.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_roster) elem
    where coalesce(nullif(elem->>'player_id', ''), '') = ''
       or coalesce(nullif(elem->>'player_name', ''), '') = ''
       or elem->>'role' not in ('captain','defender','starter')
  ) then
    raise exception 'Fanta roster contains invalid players or roles.';
  end if;

  insert into fanta_teams (workspace_id, tournament_id, user_id, name, status, submitted_at, updated_at)
  values (p_workspace_id, v_tournament_id, v_user_id, trim(p_team_name), 'confirmed', now(), now())
  on conflict on constraint fanta_teams_workspace_tournament_user_key
  do update set
    name = excluded.name,
    status = 'confirmed',
    submitted_at = now(),
    updated_at = now()
  returning id into v_team_id;

  delete from fanta_rosters where team_id = v_team_id;

  insert into fanta_rosters (team_id, player_id, player_name, real_team_id, real_team_name, role)
  select
    v_team_id,
    player_id,
    player_name,
    nullif(real_team_id, ''),
    nullif(real_team_name, ''),
    role
  from jsonb_to_recordset(p_roster) as roster(
    player_id text,
    player_name text,
    real_team_id text,
    real_team_name text,
    role text
  );

  return v_team_id;
end;
$$;

grant execute on function public.fanta_save_team(text, text, text, jsonb) to authenticated;
