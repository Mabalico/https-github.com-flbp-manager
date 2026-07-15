-- FLBP Manager Suite - il seed fanta di test usa player_id realistici.
--
-- Bug (solo test): flbp_sim_seed_fanta_pretournament costruiva player_id come
--   lower(nome con underscore) || '_ND'
-- ignorando la data di nascita. Ma gli stat reali (sia la RPC per-match
-- flbp_match_result_player_key sia l'export normalizzato client) usano la
-- chiave `nome_AAAA-MM-GG` per i giocatori con data di nascita registrata.
-- Cosi' la vista fanta LIVE non agganciava i canestri di quei giocatori
-- (match per player_key mancato) tranne per via del ripiego team+nome, che a
-- sua volta salta per i giocatori presenti in piu' squadre. In produzione le
-- rose fanta reali usano gia' le chiavi con data, quindi il problema non si
-- presenta: e' un artefatto del seed. Fix: il seed calcola player_id come la
-- RPC (nome + data di nascita validata, altrimenti 'ND').
--
-- Ridefinizione integrale della funzione (identica salvo la CTE raw_players/
-- keyed che ora porta e usa la data di nascita).

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
      trim(coalesce(team_json->>slot.birth_field, '')) as player_birthdate,
      lower(coalesce(team_json->>'hidden', 'false')) = 'true' as hidden,
      lower(coalesce(team_json->>'isBye', team_json->>'is_bye', 'false')) = 'true' as is_bye
    from public.workspace_state ws
    cross join lateral jsonb_array_elements(coalesce(ws.state->'teams', '[]'::jsonb)) with ordinality as teams(team_json, ordinality)
    cross join lateral (
      values ('player1'::text, 'player1'::text, 'player1BirthDate'::text),
             ('player2'::text, 'player2'::text, 'player2BirthDate'::text)
    ) as slot(slot_name, slot_field, birth_field)
    where ws.workspace_id = v_workspace_id
  ),
  keyed as (
    select
      -- Stessa derivazione di flbp_match_result_player_key: nome + data di
      -- nascita validata (AAAA-MM-GG), altrimenti 'ND'.
      regexp_replace(lower(trim(player_name)), '\s+', '_', 'g') || '_' ||
        case when player_birthdate ~ '^\d{4}-\d{2}-\d{2}$' then player_birthdate else 'ND' end as player_id,
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
