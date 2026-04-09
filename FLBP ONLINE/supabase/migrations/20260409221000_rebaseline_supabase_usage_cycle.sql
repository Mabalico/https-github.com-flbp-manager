do $$
declare
  v_workspace_id text := 'default';
  v_cycle_start date := date '2026-03-22';
  v_cycle_end date := date '2026-04-09';
  v_target_response_bytes bigint := 469000000;
  v_response_total numeric := 0;
  v_scale numeric := 0;
begin
  select coalesce(sum(response_bytes), 0)
  into v_response_total
  from public.app_supabase_usage_daily
  where workspace_id = v_workspace_id
    and usage_date >= v_cycle_start
    and usage_date <= v_cycle_end;

  if v_response_total <= 0 then
    return;
  end if;

  v_scale := v_target_response_bytes::numeric / v_response_total;

  with scoped as (
    select
      workspace_id,
      usage_date,
      bucket,
      request_count,
      request_bytes,
      response_bytes,
      (request_count > 100000 or request_bytes > 268435456) as is_outlier,
      round(response_bytes * v_scale)::bigint as response_bytes_new,
      round(request_bytes * v_scale)::bigint as request_bytes_scaled,
      greatest(1::bigint, round(request_count * v_scale)::bigint) as request_count_scaled
    from public.app_supabase_usage_daily
    where workspace_id = v_workspace_id
      and usage_date >= v_cycle_start
      and usage_date <= v_cycle_end
  ), normalized as (
    select
      workspace_id,
      usage_date,
      bucket,
      response_bytes_new,
      case
        when is_outlier and response_bytes_new > 0
          then least(request_bytes_scaled, greatest(round(response_bytes_new * 0.35)::bigint, 262144::bigint), 16777216::bigint)
        when is_outlier
          then least(request_bytes_scaled, 16777216::bigint)
        else request_bytes_scaled
      end as request_bytes_new,
      case
        when is_outlier and response_bytes_new > 0
          then greatest(
            1::bigint,
            ceil((
              least(request_bytes_scaled, greatest(round(response_bytes_new * 0.35)::bigint, 262144::bigint), 16777216::bigint)
              + response_bytes_new
            )::numeric / 65536.0)::bigint
          )
        when is_outlier
          then greatest(
            1::bigint,
            ceil((least(request_bytes_scaled, 16777216::bigint) + response_bytes_new)::numeric / 65536.0)::bigint
          )
        else request_count_scaled
      end as request_count_new
    from scoped
  )
  update public.app_supabase_usage_daily target
  set request_count = normalized.request_count_new,
      request_bytes = normalized.request_bytes_new,
      response_bytes = normalized.response_bytes_new,
      updated_at = now()
  from normalized
  where target.workspace_id = normalized.workspace_id
    and target.usage_date = normalized.usage_date
    and target.bucket = normalized.bucket;
end;
$$;
