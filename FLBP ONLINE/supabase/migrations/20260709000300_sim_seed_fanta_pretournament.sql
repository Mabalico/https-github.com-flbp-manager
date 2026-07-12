-- FLBP Manager Suite - seed di squadre Fanta pretorneo per i test/simulazioni.
--
-- Versione RPC (admin-gated) dello script manuale usato nei test: crea una
-- squadra Fanta "Fanta Test - <account>" sul container __pre_tournament__ per
-- ogni account player_app_profiles che non ne ha una, con 4 giocatori casuali
-- (1 capitano, 2 difensori, 1 titolare) presi dalla lista iscritti nello
-- snapshot admin. Con p_team_id_prefix la scelta e' limitata alle squadre il
-- cui id inizia con quel prefisso (es. 'simt_' per le squadre del simulatore),
-- cosi' i punteggi Fanta sono verificabili end-to-end.

alter table if exists public.fanta_rosters
  add column if not exists real_team_slot text;

create or replace function public.flbp_sim_seed_fanta_pretournament(
  p_workspace_id text default 'default',
  p_overwrite boolean default false,
  p_team_id_prefix text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_container_id text := '__pre_tournament__';
  v_prefix text := nullif(trim(coalesce(p_team_id_prefix, '')), '');
  v_eligible_count int := 0;
  v_target_count int := 0;
  v_created_count int := 0;
  v_roster_count int := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  perform pg_advisory_xact_lock(hashtext('flbp_seed_fanta_pretournament:' || v_workspace_id));

  -- Container pretorneo sempre presente (protetto dal trigger anti-delete).
  insert into public.tournaments (
    workspace_id, id, name, start_date, type, config, is_manual, status, updated_at
  )
  values (
    v_workspace_id, v_container_id, 'Pretorneo', now(), 'elimination',
    jsonb_build_object('fantaPreTournament', true), true, 'live', now()
  )
  on conflict (workspace_id, id) do update set
    name = excluded.name,
    config = excluded.config,
    is_manual = true,
    status = 'live',
    updated_at = now();

  if p_overwrite then
    delete from public.fanta_rosters fr
    using public.fanta_teams ft
    where fr.team_id = ft.id
      and ft.workspace_id = v_workspace_id
      and ft.tournament_id = v_container_id;

    delete from public.fanta_teams
    where workspace_id = v_workspace_id
      and tournament_id = v_container_id;
  end if;

  -- Pool giocatori eleggibili dallo snapshot ADMIN (lista iscritti corrente).
  create temp table _sim_eligible_players on commit drop as
  with raw_players as (
    select
      coalesce(nullif(team_json->>'id', ''), 'team_' || ordinality::text) as real_team_id,
      coalesce(nullif(team_json->>'name', ''), 'Squadra ' || ordinality::text) as real_team_name,
      slot.slot_name as real_team_slot,
      trim(coalesce(team_json->>slot.slot_field, '')) as player_name,
      lower(coalesce(team_json->>'hidden', 'false')) = 'true' as hidden,
      lower(coalesce(team_json->>'isBye', team_json->>'is_bye', 'false')) = 'true' as is_bye
    from public.workspace_state ws
    cross join lateral jsonb_array_elements(coalesce(ws.state->'teams', '[]'::jsonb)) with ordinality as teams(team_json, ordinality)
    cross join lateral (
      values ('player1'::text, 'player1'::text), ('player2'::text, 'player2'::text)
    ) as slot(slot_name, slot_field)
    where ws.workspace_id = v_workspace_id
  ),
  keyed as (
    select
      regexp_replace(lower(trim(player_name)), '\s+', '_', 'g') || '_ND' as player_id,
      player_name,
      real_team_id,
      real_team_name,
      real_team_slot
    from raw_players
    where player_name <> ''
      and hidden = false
      and is_bye = false
      and (v_prefix is null or real_team_id like v_prefix || '%')
  )
  select distinct on (player_id)
    player_id, player_name, real_team_id, real_team_name, real_team_slot
  from keyed
  order by player_id, random();

  select count(*) into v_eligible_count from _sim_eligible_players;
  if v_eligible_count < 4 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_enough_players',
      'eligible_players', v_eligible_count
    );
  end if;

  -- Account player senza squadra Fanta sul container.
  create temp table _sim_target_users on commit drop as
  select
    p.user_id,
    trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as owner_name
  from public.player_app_profiles p
  where p.workspace_id = v_workspace_id
    and p.user_id is not null
    and not exists (
      select 1
      from public.fanta_teams ft
      where ft.workspace_id = v_workspace_id
        and ft.tournament_id = v_container_id
        and ft.user_id = p.user_id
    );

  select count(*) into v_target_count from _sim_target_users;
  if v_target_count = 0 then
    return jsonb_build_object(
      'ok', true,
      'created_teams', 0,
      'roster_rows', 0,
      'eligible_players', v_eligible_count,
      'accounts_without_team', 0,
      'note', 'tutti gli account hanno gia una squadra pretorneo'
    );
  end if;

  -- 4 giocatori DISTINTI e casuali per ogni account (randomizzazione per-utente
  -- garantita: cross join completo + row_number per partizione).
  create temp table _sim_selected_rosters on commit drop as
  select user_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, pick_rank
  from (
    select
      u.user_id,
      ep.player_id, ep.player_name, ep.real_team_id, ep.real_team_name, ep.real_team_slot,
      row_number() over (partition by u.user_id order by random()) as pick_rank
    from _sim_target_users u
    cross join _sim_eligible_players ep
  ) ranked
  where pick_rank <= 4;

  create temp table _sim_created_teams on commit drop as
  select gen_random_uuid() as id, u.user_id, u.owner_name
  from _sim_target_users u;

  insert into public.fanta_teams (
    id, workspace_id, tournament_id, user_id, name, status, submitted_at, created_at, updated_at
  )
  select
    ct.id, v_workspace_id, v_container_id, ct.user_id,
    'Fanta Test - ' || coalesce(nullif(ct.owner_name, ''), ct.user_id::text),
    'confirmed', now(), now(), now()
  from _sim_created_teams ct;

  get diagnostics v_created_count = row_count;

  insert into public.fanta_rosters (
    team_id, player_id, player_name, real_team_id, real_team_name, real_team_slot, role
  )
  select
    ct.id, sr.player_id, sr.player_name, sr.real_team_id, sr.real_team_name, sr.real_team_slot,
    case
      when sr.pick_rank = 1 then 'captain'
      when sr.pick_rank in (2, 3) then 'defender'
      else 'starter'
    end
  from _sim_created_teams ct
  join _sim_selected_rosters sr on sr.user_id = ct.user_id;

  get diagnostics v_roster_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'created_teams', v_created_count,
    'roster_rows', v_roster_count,
    'eligible_players', v_eligible_count,
    'accounts_without_team', v_target_count
  );
end;
$$;

revoke all on function public.flbp_sim_seed_fanta_pretournament(text, boolean, text) from public, anon;
grant execute on function public.flbp_sim_seed_fanta_pretournament(text, boolean, text) to authenticated;
