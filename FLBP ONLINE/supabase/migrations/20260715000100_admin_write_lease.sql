-- FLBP Manager Suite - "un solo admin scrive alla volta" (write lease).
--
-- Problema: il modello a snapshot unico consente a due finestre Admin aperte
-- di sovrascriversi a vicenda (classe di guasti del 4 luglio). Il controllo
-- ottimistico su base_updated_at intercetta molti casi ma non tutti (es.
-- export strutturato su pagehide da una scheda stantia).
--
-- Soluzione: un "testimone di scrittura" per workspace. La sessione Admin
-- attiva lo acquisisce e lo rinnova con un heartbeat (~25s, TTL 90s). Le
-- altre finestre Admin sono in sola lettura e possono prenderlo con un
-- takeover esplicito. Le RPC di scrittura admin rifiutano chi non detiene il
-- testimone quando un testimone valido esiste: cosi' nemmeno una scheda
-- "zombie" (bundle vecchio che non passa p_lease_holder) puo' scrivere mentre
-- una sessione e' attiva. Se nessun testimone e' attivo (o e' scaduto) le
-- scritture restano permesse: retrocompatibile con script e vecchi client a
-- riposo.
--
-- Il canale arbitri (flbp_referee_push_*) NON e' toccato: e' gia' protetto da
-- password + patch per-singola-partita con anti-regressione.

create table if not exists public.admin_write_lease (
  workspace_id text primary key,
  holder_id text not null,
  holder_label text,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  ttl_seconds integer not null default 90
);

alter table public.admin_write_lease enable row level security;
-- Nessuna policy: si accede solo tramite le RPC security definer qui sotto.

-- Helper interno: solleva un errore se un testimone VALIDO esiste e il
-- chiamante non lo detiene. p_lease_holder null = client che non conosce il
-- lease (bundle vecchio/script): rifiutato solo se qualcuno e' attivo.
create or replace function public.flbp_admin_assert_write_lease(
  p_workspace_id text,
  p_lease_holder text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_holder text := nullif(trim(coalesce(p_lease_holder, '')), '');
  v_cur record;
begin
  select holder_id, holder_label, heartbeat_at, ttl_seconds
  into v_cur
  from public.admin_write_lease
  where workspace_id = v_workspace_id;

  if found and v_cur.heartbeat_at + make_interval(secs => v_cur.ttl_seconds) > now() then
    if v_holder is null or v_holder <> v_cur.holder_id then
      raise exception 'FLBP_LEASE_HELD: la scrittura admin e'' riservata alla sessione attiva (%). Usa "Prendi il controllo" da quella finestra oppure da questa.',
        coalesce(v_cur.holder_label, 'altra finestra Admin')
        using detail = jsonb_build_object(
          'holder_label', v_cur.holder_label,
          'heartbeat_at', v_cur.heartbeat_at
        )::text;
    end if;
  end if;
end;
$$;

revoke all on function public.flbp_admin_assert_write_lease(text, text) from public, anon, authenticated;

-- Acquisizione/rinnovo. Ritorna acquired=true se il chiamante detiene ora il
-- testimone (nuovo, rinnovato, scaduto-e-riassegnato o takeover), altrimenti
-- acquired=false con le info del detentore corrente.
create or replace function public.flbp_admin_acquire_write_lease(
  p_workspace_id text default 'default',
  p_holder_id text default null,
  p_holder_label text default null,
  p_takeover boolean default false,
  p_ttl_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_holder text := nullif(trim(coalesce(p_holder_id, '')), '');
  v_label text := nullif(trim(coalesce(p_holder_label, '')), '');
  v_ttl integer := least(greatest(coalesce(p_ttl_seconds, 90), 30), 300);
  v_now timestamptz := now();
  v_cur record;
  v_acquired_at timestamptz := now();
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if v_holder is null then
    raise exception 'Holder mancante per il write lease';
  end if;

  perform pg_advisory_xact_lock(hashtext('flbp_admin_write_lease:' || v_workspace_id));

  select holder_id, holder_label, acquired_at, heartbeat_at, ttl_seconds
  into v_cur
  from public.admin_write_lease
  where workspace_id = v_workspace_id
  for update;

  if found
    and v_cur.holder_id <> v_holder
    and not coalesce(p_takeover, false)
    and v_cur.heartbeat_at + make_interval(secs => v_cur.ttl_seconds) > v_now
  then
    return jsonb_build_object(
      'ok', true,
      'acquired', false,
      'holder_id', v_cur.holder_id,
      'holder_label', v_cur.holder_label,
      'acquired_at', v_cur.acquired_at,
      'heartbeat_at', v_cur.heartbeat_at
    );
  end if;

  if found and v_cur.holder_id = v_holder then
    v_acquired_at := v_cur.acquired_at;
  end if;

  insert into public.admin_write_lease (workspace_id, holder_id, holder_label, acquired_at, heartbeat_at, ttl_seconds)
  values (v_workspace_id, v_holder, v_label, v_acquired_at, v_now, v_ttl)
  on conflict (workspace_id) do update
  set holder_id = excluded.holder_id,
      holder_label = excluded.holder_label,
      acquired_at = excluded.acquired_at,
      heartbeat_at = excluded.heartbeat_at,
      ttl_seconds = excluded.ttl_seconds;

  return jsonb_build_object(
    'ok', true,
    'acquired', true,
    'holder_id', v_holder,
    'holder_label', v_label,
    'acquired_at', v_acquired_at,
    'heartbeat_at', v_now,
    'ttl_seconds', v_ttl
  );
end;
$$;

revoke all on function public.flbp_admin_acquire_write_lease(text, text, text, boolean, integer) from public, anon;
grant execute on function public.flbp_admin_acquire_write_lease(text, text, text, boolean, integer) to authenticated;

create or replace function public.flbp_admin_release_write_lease(
  p_workspace_id text default 'default',
  p_holder_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := coalesce(nullif(trim(p_workspace_id), ''), 'default');
  v_holder text := nullif(trim(coalesce(p_holder_id, '')), '');
  v_released integer := 0;
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if v_holder is null then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  delete from public.admin_write_lease
  where workspace_id = v_workspace_id
    and holder_id = v_holder;
  get diagnostics v_released = row_count;

  return jsonb_build_object('ok', true, 'released', v_released > 0);
end;
$$;

revoke all on function public.flbp_admin_release_write_lease(text, text) from public, anon;
grant execute on function public.flbp_admin_release_write_lease(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement nelle RPC di scrittura admin. La firma cambia (nuovo parametro
-- p_lease_holder con default): la vecchia funzione va DROPPATA prima, non
-- sovraccaricata, altrimenti PostgREST vede due candidate ambigue.
-- ---------------------------------------------------------------------------

drop function if exists public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean);

create or replace function public.flbp_admin_push_workspace_state(
  p_workspace_id text,
  p_state jsonb,
  p_public_state jsonb,
  p_base_updated_at timestamptz default null,
  p_force boolean default false,
  p_lease_holder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_current_updated_at timestamptz;
  v_next_updated_at timestamptz := now();
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  -- Un solo admin scrive alla volta: vale anche per p_force (il takeover del
  -- lease e' l'unico modo legittimo di scavalcare la sessione attiva).
  perform public.flbp_admin_assert_write_lease(v_workspace_id, p_lease_holder);

  insert into public.workspaces (id)
  values (v_workspace_id)
  on conflict (id) do nothing;

  select ws.updated_at
  into v_current_updated_at
  from public.workspace_state ws
  where ws.workspace_id = v_workspace_id
  for update;

  if not coalesce(p_force, false) and v_current_updated_at is not null then
    if p_base_updated_at is null then
      raise exception 'FLBP_DB_CONFLICT: il DB contiene gia'' uno snapshot admin piu'' recente'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;

    if v_current_updated_at is distinct from p_base_updated_at then
      raise exception 'FLBP_DB_CONFLICT: il DB e'' stato aggiornato da un altro admin'
        using detail = jsonb_build_object('updated_at', v_current_updated_at)::text;
    end if;
  end if;

  insert into public.workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  insert into public.public_workspace_state (workspace_id, state, updated_at)
  values (v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at)
  on conflict (workspace_id) do update
  set state = excluded.state,
      updated_at = excluded.updated_at;

  perform public.flbp_upsert_public_workspace_live(v_workspace_id, coalesce(p_public_state, '{}'::jsonb), v_next_updated_at);

  return jsonb_build_object('ok', true, 'updated_at', v_next_updated_at);
end;
$$;

grant execute on function public.flbp_admin_push_workspace_state(text, jsonb, jsonb, timestamptz, boolean, text) to authenticated;

drop function if exists public.flbp_admin_push_match_result(text, text, text, jsonb);

create or replace function public.flbp_admin_push_match_result(
  p_workspace_id text,
  p_tournament_id text,
  p_match_id text,
  p_matches jsonb,
  p_lease_holder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  perform public.flbp_admin_assert_write_lease(p_workspace_id, p_lease_holder);

  return public.flbp_apply_match_result_patch(p_workspace_id, p_tournament_id, p_match_id, p_matches);
end;
$$;

grant execute on function public.flbp_admin_push_match_result(text, text, text, jsonb, text) to authenticated;
