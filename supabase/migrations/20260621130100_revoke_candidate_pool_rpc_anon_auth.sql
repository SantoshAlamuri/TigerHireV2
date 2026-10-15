-- Phase 2: lock down the candidate-pool SECURITY DEFINER functions.
-- get_accessible_candidate_ids / list_accessible_candidate_ids_page bypass RLS
-- and trust p_organisation_ids, so a direct /rest/v1/rpc call by any
-- authenticated (or anon) user could enumerate candidates cross-org. The app
-- now calls these via the service-role admin client (CandidateRepository), with
-- organisation_ids derived server-side from the caller's auth context, so EXECUTE
-- can be revoked from anon/authenticated without affecting the application.
--
-- IMPORTANT: apply only AFTER the admin-client code change is deployed, otherwise
-- the previously-deployed code (which calls these via the user client) will 403.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_accessible_candidate_ids','list_accessible_candidate_ids_page')
  loop
    execute format('revoke execute on function %s from anon, authenticated, public;', r.sig);
  end loop;
end $$;
