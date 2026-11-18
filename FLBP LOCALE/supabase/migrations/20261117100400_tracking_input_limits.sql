-- Anonymous usage counters: no new workspaces, no arbitrary dates.
--
-- flbp_track_supabase_usage_batch is executable by anon and created a
-- workspaces row for any id it received, accepted any usage_date and any
-- number of items. flbp_track_site_view accepted any p_view_date. Both keep
-- their signature and response shape; only the accepted input narrows:
-- - dates must be within one day of the server's UTC date (any visitor time
--   zone fits). Site views outside that window count on the server date;
--   usage rows outside it are ignored (the client discards them after a
--   successful flush, exactly as before);
-- - the usage batch reads at most 64 items (6 buckets per day: a current
--   client sends far fewer) and never creates a workspace: for an unknown
--   workspace it returns {ok:false, reason:'workspace_missing', rows:0}.
-- Safe to reapply.

create or replace function public.flbp_track_supabase_usage_batch(
  p_workspace_id text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_items jsonb := '[]'::jsonb;
begin
  if nullif(trim(coalesce(p_workspace_id, '')), '') is null then
    raise exception 'Workspace non valido';
  end if;

  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'workspace_missing', 'rows', 0);
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then
    select coalesce(jsonb_agg(e.value order by e.position), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(p_items) with ordinality as e(value, position)
    where e.position <= 64;
  end if;

  with payload as (
    select
      coalesce(usage_date, v_today) as usage_date,
      case
        when lower(coalesce(bucket, 'unknown')) in ('public', 'tv', 'admin', 'referee', 'sync', 'unknown')
          then lower(coalesce(bucket, 'unknown'))
        else 'unknown'
      end as bucket,
      least(greatest(coalesce(request_count, 0), 0), 100000)::bigint as request_count,
      least(greatest(coalesce(request_bytes, 0), 0), 536870912)::bigint as request_bytes,
      least(greatest(coalesce(response_bytes, 0), 0), 536870912)::bigint as response_bytes
    from jsonb_to_recordset(v_items) as x(
      usage_date date,
      bucket text,
      request_count bigint,
      request_bytes bigint,
      response_bytes bigint
    )
  ), merged as (
    select
      usage_date,
      bucket,
      least(sum(request_count)::bigint, 100000::bigint) as request_count,
      least(sum(request_bytes)::bigint, 536870912::bigint) as request_bytes,
      least(sum(response_bytes)::bigint, 536870912::bigint) as response_bytes
    from payload
    where usage_date between v_today - 1 and v_today + 1
    group by usage_date, bucket
  )
  insert into public.app_supabase_usage_daily (
    workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    updated_at
  )
  select
    p_workspace_id,
    usage_date,
    bucket,
    request_count,
    request_bytes,
    response_bytes,
    now()
  from merged
  where request_count > 0 or request_bytes > 0 or response_bytes > 0
  on conflict (workspace_id, usage_date, bucket) do update
  set request_count = least(public.app_supabase_usage_daily.request_count + excluded.request_count, 100000::bigint),
      request_bytes = least(public.app_supabase_usage_daily.request_bytes + excluded.request_bytes, 536870912::bigint),
      response_bytes = least(public.app_supabase_usage_daily.response_bytes + excluded.response_bytes, 536870912::bigint),
      updated_at = now();

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows
  );
end;
$$;
revoke all on function public.flbp_track_supabase_usage_batch(text, jsonb) from public;
grant execute on function public.flbp_track_supabase_usage_batch(text, jsonb) to anon, authenticated, service_role;

create or replace function public.flbp_track_site_view(
  p_workspace_id text,
  p_view_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_view_date date := coalesce(p_view_date, (now() at time zone 'utc')::date);
  v_views bigint;
begin
  if v_view_date < v_today - 1 or v_view_date > v_today + 1 then
    v_view_date := v_today;
  end if;

  insert into public.public_site_views_daily (workspace_id, view_date, views, created_at, updated_at)
  values (p_workspace_id, v_view_date, 1, now(), now())
  on conflict (workspace_id, view_date) do update
  set views = public.public_site_views_daily.views + 1,
      updated_at = now()
  returning views into v_views;

  return jsonb_build_object(
    'ok', true,
    'view_date', v_view_date,
    'views', v_views
  );
end;
$$;
revoke all on function public.flbp_track_site_view(text, date) from public;
grant execute on function public.flbp_track_site_view(text, date) to anon, authenticated, service_role;
