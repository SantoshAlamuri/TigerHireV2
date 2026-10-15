-- Verification pass on the 2026-07-28 tenancy fixes found that they hardened the
-- API layer while leaving the DB primitives open. The app ships a browser client
-- with the anon key, so RLS — not the route — is the boundary.
--
-- 1. candidate_notes INSERT/UPDATE were `author_id = auth.uid()` only, so any
--    authenticated user (including candidate_free) could POST a note directly to
--    PostgREST with an arbitrary candidate_id/job_id, or PATCH their own note onto
--    another org's job. This is exactly what the new API-layer check was written to
--    prevent, bypassed one layer down.
-- 2. The SELECT policy scoped by CANDIDATE, not by job/org: for a candidate who
--    applied to org A and org B, A could still read B's notes via PostgREST.
--    Untagged notes are now scoped to the author's org, which also restores
--    teammate visibility that the API-layer fix had narrowed to author-only.
-- 3. auth_organisation_ids() ignored agency_clients.is_active, so deactivating an
--    agency link revoked nothing at the DB layer for ANY policy using it.

-- ---------------------------------------------------------------------------
-- 3: honour is_active in the shared org-expansion helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_organisation_ids()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  my_org uuid;
  my_role public.app_role;
  client_ids uuid[];
BEGIN
  SELECT organisation_id, role INTO my_org, my_role
  FROM public.profiles WHERE id = auth.uid();
  IF my_org IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  IF my_role = 'agency' THEN
    BEGIN
      SELECT COALESCE(array_agg(ac.client_organisation_id), ARRAY[]::uuid[])
      INTO client_ids
      FROM public.agency_clients ac
      WHERE ac.agency_organisation_id = my_org
        AND ac.is_active IS TRUE;
      RETURN ARRAY[my_org] || COALESCE(client_ids, ARRAY[]::uuid[]);
    EXCEPTION WHEN undefined_table THEN
      RETURN ARRAY[my_org];
    END;
  END IF;
  RETURN ARRAY[my_org];
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2: job/org-scoped reads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can read candidate notes" ON public.candidate_notes;
CREATE POLICY "Org members can read candidate notes"
  ON public.candidate_notes FOR SELECT
  USING (
    author_id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR (
      (SELECT public.auth_role()) IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role,
        'agency'::public.app_role
      )
      AND (
        -- Job-tagged notes belong to that job's organisation.
        (
          candidate_notes.job_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = candidate_notes.job_id
              AND j.organisation_id = ANY (public.auth_organisation_ids())
          )
        )
        -- Untagged notes belong to the author's organisation (keeps teammates
        -- collaborating without exposing them across tenants).
        OR (
          candidate_notes.job_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = candidate_notes.author_id
              AND p.organisation_id = ANY (public.auth_organisation_ids())
          )
        )
      )
    )
    OR (
      (SELECT public.auth_role()) = 'hiring_manager'::public.app_role
      AND candidate_notes.job_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = candidate_notes.job_id
          AND j.hiring_manager_id = (SELECT auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 1: write-side scoping
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create notes" ON public.candidate_notes;
CREATE POLICY "Authenticated users can create notes"
  ON public.candidate_notes FOR INSERT
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.can_caller_orgs_access_candidate(candidate_notes.candidate_id)
    AND (
      candidate_notes.job_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = candidate_notes.job_id
          AND j.organisation_id = ANY (public.auth_organisation_ids())
      )
    )
  );

DROP POLICY IF EXISTS "Authors can update own notes" ON public.candidate_notes;
CREATE POLICY "Authors can update own notes"
  ON public.candidate_notes FOR UPDATE
  USING (author_id = (SELECT auth.uid()))
  -- WITH CHECK was absent, so an author could retarget their own note onto
  -- another organisation's job.
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.can_caller_orgs_access_candidate(candidate_notes.candidate_id)
    AND (
      candidate_notes.job_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = candidate_notes.job_id
          AND j.organisation_id = ANY (public.auth_organisation_ids())
      )
    )
  );
