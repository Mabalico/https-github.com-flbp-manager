create or replace function public.flbp_admin_list_player_accounts(
  p_workspace_id text,
  p_origin text default null
)
returns table (
  user_id uuid,
  email text,
  providers text[],
  primary_provider text,
  created_at timestamptz,
  last_login_at timestamptz,
  linked_player_name text,
  birth_date date,
  canonical_player_id text,
  has_profile boolean,
  device_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id text := nullif(trim(coalesce(p_workspace_id, '')), '');
  v_origin text := lower(nullif(trim(coalesce(p_origin, '')), ''));
begin
  if not public.flbp_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  if v_workspace_id is null then
    raise exception 'Workspace non valido';
  end if;

  return query
  with identity_rows as (
    select
      u.id as user_id,
      case
        when lower(coalesce(i.provider, '')) in ('email', 'password') then 'in_app'
        when lower(coalesce(i.provider, '')) in ('google', 'facebook', 'apple') then lower(i.provider)
        when nullif(trim(u.email), '') is not null then 'in_app'
        else 'other'
      end as origin
    from auth.users u
    left join auth.identities i on i.user_id = u.id
  ),
  aggregated_origins as (
    select
      ir.user_id,
      array_remove(array_agg(distinct ir.origin), null) as origins
    from identity_rows ir
    group by ir.user_id
  ),
  device_counts as (
    select
      d.workspace_id,
      d.user_id,
      count(*)::int as device_count
    from public.player_app_devices d
    where d.workspace_id = v_workspace_id
    group by d.workspace_id, d.user_id
  )
  select
    u.id,
    nullif(trim(u.email), '') as email,
    coalesce(
      ao.origins,
      case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
    ) as providers,
    coalesce(
      (
        coalesce(
          ao.origins,
          case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
        )
      )[1],
      'other'
    ) as primary_provider,
    u.created_at,
    u.last_sign_in_at,
    prof.canonical_player_name,
    prof.birth_date,
    prof.canonical_player_id,
    (prof.user_id is not null) as has_profile,
    coalesce(dc.device_count, 0) as device_count
  from auth.users u
  left join aggregated_origins ao on ao.user_id = u.id
  left join public.player_app_profiles prof
    on prof.workspace_id = v_workspace_id
   and prof.user_id = u.id
  left join device_counts dc
    on dc.workspace_id = v_workspace_id
   and dc.user_id = u.id
  where (
    prof.user_id is not null
    or dc.device_count is not null
    or ao.user_id is not null
  )
  and (
    v_origin is null
    or v_origin = 'all'
    or v_origin = any(
      coalesce(
        ao.origins,
        case when nullif(trim(u.email), '') is not null then array['in_app']::text[] else array['other']::text[] end
      )
    )
  )
  order by coalesce(u.last_sign_in_at, u.created_at) desc nulls last, nullif(trim(u.email), '') asc nulls last;
end;
$$;

grant execute on function public.flbp_admin_list_player_accounts(text, text) to authenticated;
