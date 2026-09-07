-- Reduce FantaBeerpong save contention on the shared tournament parent row.
--
-- Every roster save previously upserted tournaments and therefore rewrote the
-- same (workspace_id, id) row. Concurrent players were serialized behind that
-- otherwise unnecessary UPDATE. Keep parent materialization race-safe and only
-- repair an existing FK container when its semantic values actually diverge.

-- Cooperating match writers close the first-match race without locking every
-- bracket row or depending on the order used by a bulk REST statement.
create or replace function public.flbp_fanta_lock_started_match_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.hidden, false) = false
    and coalesce(new.is_bye, false) = false
    and (coalesce(new.played, false) = true or new.status = 'playing')
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        coalesce(new.workspace_id, '') || pg_catalog.chr(31) || coalesce(new.tournament_id, ''),
        20260905
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fanta_started_match_lock on public.tournament_matches;
create trigger trg_fanta_started_match_lock
before insert or update on public.tournament_matches
for each row
execute function public.flbp_fanta_lock_started_match_write();

drop trigger if exists trg_fanta_started_public_match_lock on public.public_tournament_matches;
create trigger trg_fanta_started_public_match_lock
before insert or update on public.public_tournament_matches
for each row
execute function public.flbp_fanta_lock_started_match_write();

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
  v_parent_status text;
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

    -- The common path is read-only on tournaments. ON CONFLICT still protects
    -- the first-save race when two players create the container concurrently.
    if not exists (
      select 1
      from public.tournaments t
      where t.workspace_id = p_workspace_id
        and t.id = v_tournament_id
    ) then
      insert into public.tournaments (
        workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
      ) values (
        p_workspace_id, v_tournament_id, 'Pretorneo', now(), 'elimination',
        v_tournament_config, true, 'live', now()
      )
      on conflict (workspace_id, id) do nothing;
    end if;

    -- Repair an old/stale sentinel once, without rewriting the healthy common
    -- case. The conditional predicate also prevents no-op UPDATE WAL/locks.
    update public.tournaments t
    set name = 'Pretorneo',
        config = v_tournament_config,
        is_manual = true,
        status = 'live',
        updated_at = now()
    where t.workspace_id = p_workspace_id
      and t.id = v_tournament_id
      and (
        t.name is distinct from 'Pretorneo'
        or t.config is distinct from v_tournament_config
        or t.is_manual is distinct from true
        or t.status is distinct from 'live'
      );

    -- Compatible across all player saves, but blocks archive/update writers
    -- until this transaction has atomically replaced the user's roster.
    select t.status, t.config
    into v_parent_status, v_tournament_config
    from public.tournaments t
    where t.workspace_id = p_workspace_id
      and t.id = v_tournament_id
    for share;

    if not found
      or v_parent_status <> 'live'
      or lower(coalesce(v_tournament_config->>'fantaPreTournament', 'false')) <> 'true'
    then
      raise exception 'FantaBeerpong pre-tournament container is unavailable.';
    end if;
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

    -- public_tournaments can be ahead of normalized private tables while the
    -- local data plane is active. Materialize only a missing FK parent; never
    -- rewrite an existing shared tournament row during a player save.
    if not exists (
      select 1
      from public.tournaments t
      where t.workspace_id = p_workspace_id
        and t.id = v_tournament_id
    ) then
      insert into public.tournaments (
        workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
      )
      select
        p.workspace_id,
        p.id,
        p.name,
        p.start_date,
        p.type,
        coalesce(p.config, '{}'::jsonb),
        p.is_manual,
        p.status,
        coalesce(p.updated_at, now())
      from public.public_tournaments p
      where p.workspace_id = p_workspace_id
        and p.id = v_tournament_id
        and p.status = 'live'
      on conflict (workspace_id, id) do nothing;
    end if;

    -- Preserve the public-live fallback without allowing a Fanta team to point
    -- at an archived private FK parent. Only a strictly newer public mirror may
    -- repair the private row: normalized private/public writes are sequential,
    -- so this guard prevents a temporarily stale public row from rolling the
    -- freshly written private parent back. Concurrent statements recheck the
    -- predicate after waiting and skip the no-longer-needed UPDATE.
    update public.tournaments t
    set name = p.name,
        start_date = p.start_date,
        type = p.type,
        config = coalesce(p.config, '{}'::jsonb),
        is_manual = p.is_manual,
        status = p.status,
        updated_at = coalesce(p.updated_at, now())
    from public.public_tournaments p
    where t.workspace_id = p_workspace_id
      and t.id = v_tournament_id
      and p.workspace_id = t.workspace_id
      and p.id = t.id
      and p.status = 'live'
      and p.updated_at is not null
      and (t.updated_at is null or p.updated_at > t.updated_at)
      and row(
        t.name,
        t.start_date,
        t.type,
        t.config,
        t.is_manual,
        t.status,
        t.updated_at
      ) is distinct from row(
        p.name,
        p.start_date,
        p.type,
        coalesce(p.config, '{}'::jsonb),
        p.is_manual,
        p.status,
        coalesce(p.updated_at, t.updated_at)
      );

    -- FOR SHARE is mutually compatible across player saves, so the expected
    -- burst remains parallel. Tournament update/archive paths need a conflicting
    -- row lock and therefore cannot cross the validations + Fanta upsert below.
    select t.status, t.config
    into v_parent_status, v_tournament_config
    from public.tournaments t
    where t.workspace_id = p_workspace_id
      and t.id = v_tournament_id
    for share;

    if not found or v_parent_status <> 'live' then
      raise exception 'FantaBeerpong rosters can only be saved while the tournament is live.';
    end if;

    -- Lock order is parent row -> per-tournament advisory lock. Official match
    -- RPCs update the parent before their INSERT/UPDATE trigger requests the
    -- exclusive form of the same advisory lock, avoiding a lock-order cycle.
    -- Shared mode keeps concurrent Fanta savers compatible. The trigger covers
    -- UPDATE, INSERT phantoms and hidden/bye rows becoming eligible.
    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(
        coalesce(p_workspace_id, '') || pg_catalog.chr(31) || coalesce(v_tournament_id, ''),
        20260905
      )
    );

    if lower(coalesce(v_tournament_config->>'resultsOnly', 'false')) = 'true' then
      raise exception 'FantaBeerpong requires a tournament with scorer stats.';
    end if;

    select (
      exists (
        select 1
        from public.tournament_matches
        where workspace_id = p_workspace_id
          and tournament_id = v_tournament_id
          and hidden = false
          and is_bye = false
          and (played = true or status = 'playing')
        limit 1
      )
      or exists (
        select 1
        from public.public_tournament_matches
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

  insert into public.fanta_teams (
    workspace_id, tournament_id, user_id, name, status, submitted_at, updated_at
  ) values (
    p_workspace_id, v_tournament_id, v_user_id, trim(p_team_name), 'confirmed', now(), now()
  )
  on conflict on constraint fanta_teams_workspace_tournament_user_key
  do update set
    name = excluded.name,
    status = 'confirmed',
    submitted_at = now(),
    updated_at = now()
  returning id into v_team_id;

  -- Function execution is one database transaction: replacement remains atomic
  -- even though the existing rows are replaced in two statements.
  delete from public.fanta_rosters
  where team_id = v_team_id;

  insert into public.fanta_rosters (
    team_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, role
  )
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
