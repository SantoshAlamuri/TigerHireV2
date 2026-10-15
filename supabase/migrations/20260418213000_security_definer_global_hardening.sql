-- Hardens all existing SECURITY DEFINER routines in public schema.
-- Forward-only migration.
-- Manual rollback: restore prior routine-level EXECUTE grants and search_path settings per routine.

do $$
declare
  routine record;
  routine_kind text;
begin
  for routine in
    select
      n.nspname as schema_name,
      p.proname as routine_name,
      p.prokind as routine_kind_code,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    routine_kind := case
      when routine.routine_kind_code = 'p' then 'procedure'
      else 'function'
    end;

    execute format(
      'alter %s %I.%I(%s) set search_path = pg_catalog, public',
      routine_kind,
      routine.schema_name,
      routine.routine_name,
      routine.identity_args
    );

    execute format(
      'revoke execute on %s %I.%I(%s) from public, anon',
      routine_kind,
      routine.schema_name,
      routine.routine_name,
      routine.identity_args
    );

    execute format(
      'grant execute on %s %I.%I(%s) to authenticated, service_role, postgres',
      routine_kind,
      routine.schema_name,
      routine.routine_name,
      routine.identity_args
    );
  end loop;
end
$$;
