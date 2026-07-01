-- FantaBeerpong pre-tournament roster support.
--
-- This is intentionally additive:
-- - "__pre_tournament__" is an internal Fanta-only container, not a public tournament.
-- - Admin team changes can lazily sync saved pre-tournament rosters.
-- - Player-facing replacement notices are persisted until the user sees them.

alter table public.fanta_rosters
  add column if not exists real_team_slot text;

create table if not exists public.fanta_roster_change_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  fanta_team_id uuid null references public.fanta_teams(id) on delete cascade,
  old_player_id text null,
  old_player_name text not null,
  new_player_id text null,
  new_player_name text not null,
  reason text not null default 'team_player_changed',
  created_at timestamptz not null default now(),
  seen_at timestamptz null
);

create index if not exists idx_fanta_roster_change_notices_user_unseen
  on public.fanta_roster_change_notices(workspace_id, user_id, seen_at, created_at);

alter table public.fanta_roster_change_notices enable row level security;

drop policy if exists "Owner read fanta roster notices" on public.fanta_roster_change_notices;
drop policy if exists "Owner update fanta roster notices" on public.fanta_roster_change_notices;
drop policy if exists "Admin all fanta roster notices" on public.fanta_roster_change_notices;

create policy "Owner read fanta roster notices"
  on public.fanta_roster_change_notices
  for select
  using (auth.uid() = user_id);

create policy "Owner update fanta roster notices"
  on public.fanta_roster_change_notices
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admin all fanta roster notices"
  on public.fanta_roster_change_notices
  for all
  using (public.flbp_is_admin())
  with check (public.flbp_is_admin());

grant select, update on public.fanta_roster_change_notices to authenticated;

create or replace function public.fanta_save_team(
  p_workspace_id text,
  p_tournament_id text,
  p_team_name text,
  p_roster jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_tournament_id text;
  v_config_tournament_id text;
  v_requested_tournament_id text;
  v_tournament_config jsonb := '{}'::jsonb;
  v_is_pretournament boolean := false;
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

  v_requested_tournament_id := nullif(p_tournament_id, '');
  v_is_pretournament := v_requested_tournament_id = '__pre_tournament__';

  if v_is_pretournament then
    v_tournament_id := '__pre_tournament__';
    v_tournament_config := jsonb_build_object('fantaPreTournament', true);

    insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
    values (p_workspace_id, v_tournament_id, 'Pretorneo', now(), 'elimination', v_tournament_config, true, 'live', now())
    on conflict (workspace_id, id) do update set
      name = excluded.name,
      config = excluded.config,
      is_manual = true,
      status = 'live',
      updated_at = now();
  else
    select c.active_tournament_id
    into v_config_tournament_id
    from public.fanta_config c
    where c.workspace_id = p_workspace_id;

    v_tournament_id := null;

    if v_requested_tournament_id is not null then
      select t.id, t.config
      into v_tournament_id, v_tournament_config
      from public.tournaments t
      where t.workspace_id = p_workspace_id
        and t.id = v_requested_tournament_id
        and t.status = 'live'
      limit 1;

      if v_tournament_id is null then
        select p.id, p.config
        into v_tournament_id, v_tournament_config
        from public.public_tournaments p
        where p.workspace_id = p_workspace_id
          and p.id = v_requested_tournament_id
          and p.status = 'live'
        limit 1;
      end if;
    end if;

    if v_tournament_id is null and v_config_tournament_id is not null then
      select t.id, t.config
      into v_tournament_id, v_tournament_config
      from public.tournaments t
      where t.workspace_id = p_workspace_id
        and t.id = v_config_tournament_id
        and t.status = 'live'
      limit 1;

      if v_tournament_id is null then
        select p.id, p.config
        into v_tournament_id, v_tournament_config
        from public.public_tournaments p
        where p.workspace_id = p_workspace_id
          and p.id = v_config_tournament_id
          and p.status = 'live'
        limit 1;
      end if;
    end if;

    if v_tournament_id is null then
      select t.id, t.config
      into v_tournament_id, v_tournament_config
      from public.tournaments t
      where t.workspace_id = p_workspace_id
        and t.status = 'live'
      order by t.updated_at desc
      limit 1;

      if v_tournament_id is null then
        select p.id, p.config
        into v_tournament_id, v_tournament_config
        from public.public_tournaments p
        where p.workspace_id = p_workspace_id
          and p.status = 'live'
        order by p.updated_at desc
        limit 1;
      end if;
    end if;

    if v_tournament_id is null then
      raise exception 'No live tournament available for FantaBeerpong.';
    end if;

    insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
    select p.workspace_id, p.id, p.name, p.start_date, p.type, coalesce(p.config, '{}'::jsonb), p.is_manual, p.status, coalesce(p.updated_at, now())
    from public.public_tournaments p
    where p.workspace_id = p_workspace_id
      and p.id = v_tournament_id
      and p.status = 'live'
    on conflict (workspace_id, id) do update set
      name = excluded.name,
      start_date = excluded.start_date,
      type = excluded.type,
      config = excluded.config,
      is_manual = excluded.is_manual,
      status = excluded.status,
      updated_at = excluded.updated_at;

    if not exists (
      select 1 from public.tournaments
      where workspace_id = p_workspace_id
        and id = v_tournament_id
        and status = 'live'
    ) then
      raise exception 'FantaBeerpong rosters can only be saved while the tournament is live.';
    end if;

    select coalesce(
      (select t.config from public.tournaments t where t.workspace_id = p_workspace_id and t.id = v_tournament_id limit 1),
      (select p.config from public.public_tournaments p where p.workspace_id = p_workspace_id and p.id = v_tournament_id limit 1),
      '{}'::jsonb
    )
    into v_tournament_config;

    if lower(coalesce(v_tournament_config->>'resultsOnly', 'false')) = 'true' then
      raise exception 'FantaBeerpong requires a tournament with scorer stats.';
    end if;

    select (
      exists (
        select 1 from public.tournament_matches
        where workspace_id = p_workspace_id
          and tournament_id = v_tournament_id
          and hidden = false
          and is_bye = false
          and (played = true or status = 'playing')
        limit 1
      )
      or exists (
        select 1 from public.public_tournament_matches
        where workspace_id = p_workspace_id
          and tournament_id = v_tournament_id
          and hidden = false
          and is_bye = false
          and (played = true or status = 'playing')
        limit 1
      )
    ) into v_started;

    if v_started then
      raise exception 'FantaBeerpong roster is locked because the first match has started.';
    end if;
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

  insert into public.fanta_teams (workspace_id, tournament_id, user_id, name, status, submitted_at, updated_at)
  values (p_workspace_id, v_tournament_id, v_user_id, trim(p_team_name), 'confirmed', now(), now())
  on conflict on constraint fanta_teams_workspace_tournament_user_key
  do update set
    name = excluded.name,
    status = 'confirmed',
    submitted_at = now(),
    updated_at = now()
  returning id into v_team_id;

  delete from public.fanta_rosters where team_id = v_team_id;

  insert into public.fanta_rosters (team_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, role)
  select
    v_team_id,
    player_id,
    player_name,
    nullif(real_team_id, ''),
    nullif(real_team_name, ''),
    nullif(real_team_slot, ''),
    role
  from jsonb_to_recordset(p_roster) as roster(
    player_id text,
    player_name text,
    real_team_id text,
    real_team_name text,
    real_team_slot text,
    role text
  );

  return v_team_id;
end;
$$;

grant execute on function public.fanta_save_team(text, text, text, jsonb) to authenticated;

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

create or replace function public.fanta_promote_pretournament(
  p_workspace_id text,
  p_tournament_id text,
  p_tournament_name text default null,
  p_tournament_config jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id text := nullif(p_tournament_id, '');
  v_updated int := 0;
  v_skipped int := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Admin access required.';
  end if;

  if v_tournament_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_tournament_id');
  end if;

  insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
  select p.workspace_id, p.id, p.name, p.start_date, p.type, coalesce(p.config, '{}'::jsonb), p.is_manual, p.status, coalesce(p.updated_at, now())
  from public.public_tournaments p
  where p.workspace_id = p_workspace_id
    and p.id = v_tournament_id
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    start_date = excluded.start_date,
    type = excluded.type,
    config = excluded.config,
    is_manual = excluded.is_manual,
    status = excluded.status,
    updated_at = excluded.updated_at;

  if not exists (
    select 1 from public.tournaments
    where workspace_id = p_workspace_id
      and id = v_tournament_id
  ) then
    insert into public.tournaments (workspace_id, id, name, start_date, type, config, is_manual, status, updated_at)
    values (
      p_workspace_id,
      v_tournament_id,
      coalesce(nullif(p_tournament_name, ''), 'Torneo FantaBeerpong'),
      now(),
      'elimination',
      coalesce(p_tournament_config, '{}'::jsonb),
      true,
      'live',
      now()
    )
    on conflict (workspace_id, id) do nothing;
  end if;

  select count(*)
  into v_skipped
  from public.fanta_teams pre
  where pre.workspace_id = p_workspace_id
    and pre.tournament_id = '__pre_tournament__'
    and exists (
      select 1 from public.fanta_teams live
      where live.workspace_id = p_workspace_id
        and live.tournament_id = v_tournament_id
        and live.user_id = pre.user_id
    );

  update public.fanta_teams pre
  set tournament_id = v_tournament_id,
      updated_at = now()
  where pre.workspace_id = p_workspace_id
    and pre.tournament_id = '__pre_tournament__'
    and not exists (
      select 1 from public.fanta_teams live
      where live.workspace_id = p_workspace_id
        and live.tournament_id = v_tournament_id
        and live.user_id = pre.user_id
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'promoted', v_updated, 'skipped', v_skipped);
end;
$$;

grant execute on function public.fanta_promote_pretournament(text, text, text, jsonb) to authenticated;
