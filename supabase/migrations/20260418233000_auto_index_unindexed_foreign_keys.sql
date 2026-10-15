-- Auto-index unindexed foreign keys in public schema.
-- Safe additive pass: creates indexes only when no existing index has the FK columns as a leading prefix.

do $$
declare
  fk record;
  leading_index_exists boolean;
  index_name text;
  column_list text;
begin
  for fk in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name,
      con.conrelid as relid,
      con.conkey::smallint[] as fk_attnums,
      array_agg(att.attname order by ord.ordinality) as fk_columns
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(con.conkey) with ordinality as ord(attnum, ordinality) on true
    join pg_attribute att on att.attrelid = c.oid and att.attnum = ord.attnum
    where con.contype = 'f'
      and n.nspname = 'public'
      and c.relkind = 'r'
    group by
      n.nspname,
      c.relname,
      con.conname,
      con.conrelid,
      con.conkey
  loop
    select exists (
      select 1
      from pg_index i
      where i.indrelid = fk.relid
        and i.indisvalid
        and i.indisready
        and (i.indkey::smallint[])[1:cardinality(fk.fk_attnums)] = fk.fk_attnums
    )
    into leading_index_exists;

    if leading_index_exists then
      continue;
    end if;

    column_list := array_to_string(
      array(
        select format('%I', col_name)
        from unnest(fk.fk_columns) as col_name
      ),
      ', '
    );

    index_name := format(
      'idx_%s_%s_fk',
      fk.table_name,
      array_to_string(fk.fk_columns, '_')
    );

    if char_length(index_name) > 63 then
      index_name := format(
        'idx_%s_%s_fk',
        left(fk.table_name, 24),
        left(md5(fk.table_name || ':' || fk.constraint_name), 24)
      );
    end if;

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      column_list
    );
  end loop;
end $$;
