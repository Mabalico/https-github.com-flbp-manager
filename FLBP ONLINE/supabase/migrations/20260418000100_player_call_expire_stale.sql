create or replace function public.flbp_player_expire_stale_calls(
  p_workspace_id text,
  p_cutoff timestamptz default now() - interval '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_cutoff timestamptz := coalesce(p_cutoff, now() - interval '10 minutes');
  v_user_id uuid := auth.uid();
  v_expired_count integer := 0;
begin
  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  if v_user_id is null then
    raise exception 'Sessione player richiesta';
  end if;

  -- Lazy read-path normalization: there is no scheduler, so the player read retires only
  -- this user's old ringing calls without touching ack/cancel/admin/referee flows.
  update public.player_app_calls
  set status = 'expired',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expired_at', now(),
        'expired_reason', 'stale_player_read'
      )
  where workspace_id = v_workspace_id
    and target_user_id = v_user_id
    and status = 'ringing'
    and requested_at < v_cutoff;

  get diagnostics v_expired_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'expired_count', v_expired_count,
    'cutoff', v_cutoff
  );
end;
$$;

grant execute on function public.flbp_player_expire_stale_calls(text, timestamptz) to authenticated;
