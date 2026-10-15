-- auth_rls_initplan advisor (lint 0003): wrap auth.uid()/auth.role()/auth.jwt()
-- in (select ...) so PostgreSQL evaluates them once per query (initplan) rather
-- than once per row. Big win on RLS-heavy tables once they hold real data.
--
-- Implemented as a DO block that rewrites only policies still containing a BARE
-- (unwrapped) auth call, normalizing via unwrap-then-wrap so it never produces
-- double-wraps and is fully idempotent. Uses ALTER POLICY (not DROP/CREATE) so
-- the policy's command and role set are preserved and there is no window during
-- which the policy is absent. Custom auth_* SECURITY DEFINER helper functions
-- (auth_role(), auth_organisation_id(), etc.) are intentionally left untouched —
-- they are not flagged by the advisor and changing them could alter behaviour.
do $$
declare r record; stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check,
      regexp_replace(regexp_replace(coalesce(qual,''),
        '\(\s*select\s+(auth\.(uid|role|jwt)\(\))(\s+as\s+[a-z0-9_]+)?\s*\)','\1','gi'),
        '(auth\.(uid|role|jwt)\(\))','(select \1)','g') as nq,
      regexp_replace(regexp_replace(coalesce(with_check,''),
        '\(\s*select\s+(auth\.(uid|role|jwt)\(\))(\s+as\s+[a-z0-9_]+)?\s*\)','\1','gi'),
        '(auth\.(uid|role|jwt)\(\))','(select \1)','g') as nwc
    from pg_policies
    where schemaname='public'
      and (regexp_replace(coalesce(qual,'')||' '||coalesce(with_check,''),
            '\(\s*select\s+auth\.(uid|role|jwt)\(\)(\s+as\s+[a-z0-9_]+)?\s*\)','','gi')
            ~ 'auth\.(uid|role|jwt)\(\)')
  loop
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then stmt := stmt || ' using (' || r.nq || ')'; end if;
    if r.with_check is not null then stmt := stmt || ' with check (' || r.nwc || ')'; end if;
    execute stmt;
  end loop;
end $$;
