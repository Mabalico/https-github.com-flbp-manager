-- The archive function and its live scoring views must be restored together.
-- A historical manual replay had left the 2026-06 function/view pair active
-- even though the later migration was present in schema history.

do $$
declare
  v_statement text;
  v_ordinal integer;
begin
  for v_ordinal in 1..15 loop
    select statements[v_ordinal]
    into v_statement
    from supabase_migrations.schema_migrations
    where version = '20260704000110';

    if v_statement is null then
      raise exception 'Statement % della migrazione Fanta 20260704000110 non disponibile', v_ordinal;
    end if;
    execute v_statement;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fanta_live_standings'
      and column_name = 'points_from_awards'
  ) then
    raise exception 'Vista fanta_live_standings non aggiornata con points_from_awards';
  end if;
end;
$$;
