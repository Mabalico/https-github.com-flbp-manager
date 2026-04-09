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
begin
  if nullif(trim(coalesce(p_workspace_id, '')), '') is null then
    raise exception 'Workspace non valido';
  end if;

  insert into public.workspaces (id)
  values (p_workspace_id)
  on conflict (id) do nothing;

  with payload as (
    select
      coalesce(usage_date, (now() at time zone 'utc')::date) as usage_date,
      case
        when lower(coalesce(bucket, 'unknown')) in ('public', 'tv', 'admin', 'referee', 'sync', 'unknown')
          then lower(coalesce(bucket, 'unknown'))
        else 'unknown'
      end as bucket,
      least(greatest(coalesce(request_count, 0), 0), 100000)::bigint as request_count,
      least(greatest(coalesce(request_bytes, 0), 0), 536870912)::bigint as request_bytes,
      least(greatest(coalesce(response_bytes, 0), 0), 536870912)::bigint as response_bytes
    from jsonb_to_recordset(
      case
        when jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then coalesce(p_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as x(
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

