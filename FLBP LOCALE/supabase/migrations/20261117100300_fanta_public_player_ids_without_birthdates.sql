-- FantaBeerpong player ids readable by anyone must not contain a birth date.
--
-- A player key is `name_YYYY-MM-DD` (services/playerIdentity.ts). The Fanta
-- builder always saves `name_ND` (getPlayerKey(name, 'ND')), but server-side
-- paths such as the simulation seed (20260709000600) copy the full private key
-- from workspace_state. fanta_rosters, fanta_archived_rosters and
-- fanta_archived_players are publicly readable tables, and every fanta_* view
-- republishes their player_id: name plus full birth date of possibly underage
-- players, which is also the canonical_player_id a player can claim.
--
-- Fix without changing any reader: store the same id the builder would send.
-- A trailing `_YYYY-MM-DD` becomes `_ND` on insert/update (trigger) and in the
-- existing rows (backfill). Scoring already falls back to team + name when the
-- key differs from the stats key, and award points fall back to the name.
-- If two different birth-date keys of the same name meet in one unique scope,
-- the extra rows keep a short hash suffix instead of the date, so no row is
-- lost or merged. Safe to reapply; tables that do not exist are skipped.

create or replace function public.flbp_fanta_public_player_id(p_player_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_player_id ~ '_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then regexp_replace(p_player_id, '_[0-9]{4}-[0-9]{2}-[0-9]{2}$', '_ND')
    else p_player_id
  end;
$$;
-- Both helpers are SECURITY INVOKER, read no table and are called by every
-- writer through the trigger (service_role included): no grant is narrowed.

create or replace function public.flbp_fanta_strip_player_birthdate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.player_id := public.flbp_fanta_public_player_id(new.player_id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.fanta_rosters') is not null then
    with candidates as (
      select r.id, r.team_id, r.player_id,
        public.flbp_fanta_public_player_id(r.player_id) as public_id,
        row_number() over (
          partition by r.team_id, public.flbp_fanta_public_player_id(r.player_id)
          order by r.created_at, r.id
        ) as position
      from public.fanta_rosters r
      where r.player_id ~ '_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
    update public.fanta_rosters r
    set player_id = case
      when c.position = 1 and not exists (
        select 1 from public.fanta_rosters o where o.team_id = c.team_id and o.player_id = c.public_id
      ) then c.public_id
      else c.public_id || '_' || left(md5(c.player_id), 8)
    end
    from candidates c
    where r.id = c.id;

    drop trigger if exists flbp_fanta_rosters_strip_player_birthdate on public.fanta_rosters;
    create trigger flbp_fanta_rosters_strip_player_birthdate
      before insert or update of player_id on public.fanta_rosters
      for each row execute function public.flbp_fanta_strip_player_birthdate();
  end if;

  if to_regclass('public.fanta_archived_rosters') is not null then
    with candidates as (
      select r.workspace_id, r.tournament_id, r.team_id, r.player_id,
        public.flbp_fanta_public_player_id(r.player_id) as public_id,
        row_number() over (
          partition by r.workspace_id, r.tournament_id, r.team_id, public.flbp_fanta_public_player_id(r.player_id)
          order by r.player_id
        ) as position
      from public.fanta_archived_rosters r
      where r.player_id ~ '_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
    update public.fanta_archived_rosters r
    set player_id = case
      when c.position = 1 and not exists (
        select 1 from public.fanta_archived_rosters o
        where o.workspace_id = c.workspace_id and o.tournament_id = c.tournament_id
          and o.team_id = c.team_id and o.player_id = c.public_id
      ) then c.public_id
      else c.public_id || '_' || left(md5(c.player_id), 8)
    end
    from candidates c
    where r.workspace_id = c.workspace_id and r.tournament_id = c.tournament_id
      and r.team_id = c.team_id and r.player_id = c.player_id;

    drop trigger if exists flbp_fanta_archived_rosters_strip_player_birthdate on public.fanta_archived_rosters;
    create trigger flbp_fanta_archived_rosters_strip_player_birthdate
      before insert or update of player_id on public.fanta_archived_rosters
      for each row execute function public.flbp_fanta_strip_player_birthdate();
  end if;

  if to_regclass('public.fanta_archived_players') is not null then
    with candidates as (
      select p.workspace_id, p.tournament_id, p.player_id,
        public.flbp_fanta_public_player_id(p.player_id) as public_id,
        row_number() over (
          partition by p.workspace_id, p.tournament_id, public.flbp_fanta_public_player_id(p.player_id)
          order by p.rank, p.player_id
        ) as position
      from public.fanta_archived_players p
      where p.player_id ~ '_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    )
    update public.fanta_archived_players p
    set player_id = case
      when c.position = 1 and not exists (
        select 1 from public.fanta_archived_players o
        where o.workspace_id = c.workspace_id and o.tournament_id = c.tournament_id and o.player_id = c.public_id
      ) then c.public_id
      else c.public_id || '_' || left(md5(c.player_id), 8)
    end
    from candidates c
    where p.workspace_id = c.workspace_id and p.tournament_id = c.tournament_id and p.player_id = c.player_id;

    drop trigger if exists flbp_fanta_archived_players_strip_player_birthdate on public.fanta_archived_players;
    create trigger flbp_fanta_archived_players_strip_player_birthdate
      before insert or update of player_id on public.fanta_archived_players
      for each row execute function public.flbp_fanta_strip_player_birthdate();
  end if;
end;
$$;
