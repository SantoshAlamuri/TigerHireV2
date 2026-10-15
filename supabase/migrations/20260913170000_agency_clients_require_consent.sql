-- Agency ↔ company links become two-party, and the "link is live" test finally
-- reaches every policy that reads them.
--
-- Two verified problems (issue #373):
--
-- 1. CONSENT. `POST /api/agency/clients` takes only a slug, and the INSERT policy
--    checks only that the row's agency_organisation_id is the caller's own org —
--    nothing about the client side. An approved agency could link itself to ANY
--    company and immediately read that company's jobs, pipeline candidates and
--    candidate PII. Reproduced end-to-end on preview 2026-09-13.
--
-- 2. is_active WAS A NO-OP. 20260728140000 fixed auth_organisation_ids() to honour
--    is_active, but TEN policies join agency_clients directly and none of them
--    checked it. Deactivating a link revoked nothing on pipeline_candidates,
--    pipeline_stages, pipeline_stage_transitions, candidate_unlocks or
--    interview_availability_slots. A status column gated only in the helper would
--    have been ignored exactly the same way, so the predicate is added to every
--    reader here, and an assertion at the bottom fails this migration if any
--    reader is missed.
--
-- Backfill: every existing link becomes 'active', so nothing currently working
-- changes. At time of writing prod holds exactly one link.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. status column
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS initiated_by text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Existing links predate consent; treat them as already agreed so no live access
-- changes on deploy. New rows default to 'pending'.
UPDATE public.agency_clients SET status = 'active' WHERE status = 'pending' AND created_at < now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agency_clients_status_check'
  ) THEN
    ALTER TABLE public.agency_clients
      ADD CONSTRAINT agency_clients_status_check
      CHECK (status IN ('pending', 'active', 'revoked'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agency_clients_initiated_by_check'
  ) THEN
    ALTER TABLE public.agency_clients
      ADD CONSTRAINT agency_clients_initiated_by_check
      CHECK (initiated_by IS NULL OR initiated_by IN ('agency', 'company'));
  END IF;
END $$;

COMMENT ON COLUMN public.agency_clients.status IS
  'pending = the agency asked, the company has not agreed yet (no access). active = both sides agreed. revoked = the company withdrew access. Access requires status = active AND is_active.';

CREATE INDEX IF NOT EXISTS agency_clients_client_status_idx
  ON public.agency_clients (client_organisation_id, status);

-- ---------------------------------------------------------------------------
-- 2. the single predicate, so readers cannot drift apart again
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_client_link_is_live(p_status text, p_is_active boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p_status = 'active' AND p_is_active IS TRUE;
$function$;

COMMENT ON FUNCTION public.agency_client_link_is_live(text, boolean) IS
  'The one definition of an agency_clients row granting access. Every policy and helper that reads agency_clients must apply it.';

-- ---------------------------------------------------------------------------
-- 3. helper functions
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
        AND public.agency_client_link_is_live(ac.status, ac.is_active);
      RETURN ARRAY[my_org] || COALESCE(client_ids, ARRAY[]::uuid[]);
    EXCEPTION WHEN undefined_table THEN
      RETURN ARRAY[my_org];
    END;
  END IF;
  RETURN ARRAY[my_org];
END;
$function$;

-- Parameter MUST stay p_org_id: CREATE OR REPLACE cannot rename an input
-- parameter, and dropping the function would drop the policies that depend on it.
CREATE OR REPLACE FUNCTION public.auth_can_see_organisation(p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  my_org uuid;
  my_role public.app_role;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT organisation_id, role INTO my_org, my_role
  FROM public.profiles WHERE id = auth.uid();
  IF my_org IS NULL THEN
    RETURN false;
  END IF;
  IF my_org = p_org_id THEN
    RETURN true;
  END IF;
  IF my_role = 'agency' THEN
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.agency_clients ac
        WHERE ac.agency_organisation_id = my_org
          AND ac.client_organisation_id = p_org_id
          AND public.agency_client_link_is_live(ac.status, ac.is_active)
      );
    EXCEPTION WHEN undefined_table THEN
      RETURN false;
    END;
  END IF;
  RETURN false;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. agency_clients' own policies: an agency may only ASK
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Agency or super_admin can insert agency_clients" ON public.agency_clients;
CREATE POLICY "Agency or super_admin can insert agency_clients"
  ON public.agency_clients FOR INSERT
  WITH CHECK (
    ((SELECT public.auth_role()) = 'super_admin'::public.app_role)
    OR (
      agency_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'agency'::public.app_role
      -- An agency can create a REQUEST, never a live link.
      AND status = 'pending'
    )
  );

-- Read: the agency sees its own rows (including pending ones it raised), and the
-- CLIENT company can now see who is asking for or holds access to its pipeline —
-- it previously had no policy here at all.
DROP POLICY IF EXISTS "Agency or super_admin can read agency_clients" ON public.agency_clients;
CREATE POLICY "Agency or super_admin can read agency_clients"
  ON public.agency_clients FOR SELECT
  USING (
    ((SELECT public.auth_role()) = 'super_admin'::public.app_role)
    OR (
      agency_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) = 'agency'::public.app_role
    )
    OR (
      client_organisation_id = (SELECT public.auth_organisation_id())
      AND (SELECT public.auth_role()) IN (
        'leadership'::public.app_role,
        'recruiter'::public.app_role
      )
    )
  );

-- Only the CLIENT company (or super_admin) may move a link's status. The agency
-- keeps its own is_active soft-disable but can no longer grant itself access.
DROP POLICY IF EXISTS "Agency can update own client links" ON public.agency_clients;
CREATE POLICY "Agency can update own client links"
  ON public.agency_clients FOR UPDATE
  USING (
    agency_organisation_id = (SELECT public.auth_organisation_id())
    AND (SELECT public.auth_role()) = 'agency'::public.app_role
  )
  WITH CHECK (
    agency_organisation_id = (SELECT public.auth_organisation_id())
    AND (SELECT public.auth_role()) = 'agency'::public.app_role
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Client company can decide agency_clients" ON public.agency_clients;
CREATE POLICY "Client company can decide agency_clients"
  ON public.agency_clients FOR UPDATE
  USING (
    client_organisation_id = (SELECT public.auth_organisation_id())
    AND (SELECT public.auth_role()) = 'leadership'::public.app_role
  )
  WITH CHECK (
    client_organisation_id = (SELECT public.auth_organisation_id())
    AND (SELECT public.auth_role()) = 'leadership'::public.app_role
  );

-- The client company can also remove a link outright.
DROP POLICY IF EXISTS "Client company can delete agency_clients" ON public.agency_clients;
CREATE POLICY "Client company can delete agency_clients"
  ON public.agency_clients FOR DELETE
  USING (
    client_organisation_id = (SELECT public.auth_organisation_id())
    AND (SELECT public.auth_role()) = 'leadership'::public.app_role
  );

-- ---------------------------------------------------------------------------
-- 5. every policy that joins agency_clients directly
--    Bodies are the live definitions with the liveness predicate added to the
--    agency clause; nothing else about them changes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pipeline_candidates_select ON public.pipeline_candidates;
CREATE POLICY pipeline_candidates_select ON public.pipeline_candidates FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.candidates c
            WHERE c.id = pipeline_candidates.candidate_id AND c.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = pipeline_candidates.job_id
                 AND j.organisation_id = (SELECT public.auth_organisation_id())
                 AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'finance'::public.app_role]))
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = pipeline_candidates.job_id AND j.hiring_manager_id = (SELECT auth.uid()))
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_candidates.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
    OR ((SELECT public.auth_role()) = 'interviewer'::public.app_role
        AND EXISTS (SELECT 1 FROM public.pipeline_stages ps
                    WHERE ps.id = pipeline_candidates.stage_id
                      AND (ps.interviewer_user_id = (SELECT auth.uid())
                           OR (ps.interviewer_email IS NOT NULL
                               AND length(btrim(ps.interviewer_email)) > 0
                               AND lower(btrim(ps.interviewer_email)) = lower(btrim(COALESCE((SELECT auth.jwt() ->> 'email'), '')))))))
  );

DROP POLICY IF EXISTS pipeline_candidates_insert ON public.pipeline_candidates;
CREATE POLICY pipeline_candidates_insert ON public.pipeline_candidates FOR INSERT
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.jobs j
             WHERE j.id = pipeline_candidates.job_id
               AND j.organisation_id = (SELECT public.auth_organisation_id()))
     AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role]))
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_candidates.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
  );

DROP POLICY IF EXISTS pipeline_candidates_update ON public.pipeline_candidates;
CREATE POLICY pipeline_candidates_update ON public.pipeline_candidates FOR UPDATE
  USING (
    (EXISTS (SELECT 1 FROM public.jobs j
             WHERE j.id = pipeline_candidates.job_id
               AND j.organisation_id = (SELECT public.auth_organisation_id()))
     AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role]))
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_candidates.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs j
            WHERE j.id = pipeline_candidates.job_id
              AND j.organisation_id = (SELECT public.auth_organisation_id()))
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_candidates.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
  );

DROP POLICY IF EXISTS pipeline_candidates_delete ON public.pipeline_candidates;
CREATE POLICY pipeline_candidates_delete ON public.pipeline_candidates FOR DELETE
  USING (
    (EXISTS (SELECT 1 FROM public.jobs j
             WHERE j.id = pipeline_candidates.job_id
               AND j.organisation_id = (SELECT public.auth_organisation_id()))
     AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role]))
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_candidates.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
  );

DROP POLICY IF EXISTS pipeline_stages_select ON public.pipeline_stages;
CREATE POLICY pipeline_stages_select ON public.pipeline_stages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.jobs j
            WHERE j.id = pipeline_stages.job_id
              AND j.organisation_id = (SELECT public.auth_organisation_id()))
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = pipeline_stages.job_id AND j.hiring_manager_id = (SELECT auth.uid()))
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_stages.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
  );

DROP POLICY IF EXISTS pipeline_stage_transitions_select ON public.pipeline_stage_transitions;
CREATE POLICY pipeline_stage_transitions_select ON public.pipeline_stage_transitions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.candidates c
            WHERE c.id = pipeline_stage_transitions.candidate_id AND c.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = pipeline_stage_transitions.job_id
                 AND j.organisation_id = (SELECT public.auth_organisation_id())
                 AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'finance'::public.app_role]))
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = pipeline_stage_transitions.job_id AND j.hiring_manager_id = (SELECT auth.uid()))
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_stage_transitions.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
    OR ((SELECT public.auth_role()) = 'interviewer'::public.app_role
        AND EXISTS (SELECT 1 FROM public.pipeline_candidates pc
                    JOIN public.pipeline_stages ps ON ps.id = pc.stage_id
                    WHERE pc.id = pipeline_stage_transitions.pipeline_candidate_id
                      AND (ps.interviewer_user_id = (SELECT auth.uid())
                           OR (ps.interviewer_email IS NOT NULL
                               AND length(btrim(ps.interviewer_email)) > 0
                               AND lower(btrim(ps.interviewer_email)) = lower(btrim(COALESCE((SELECT auth.jwt() ->> 'email'), '')))))))
  );

DROP POLICY IF EXISTS pipeline_stage_transitions_insert ON public.pipeline_stage_transitions;
CREATE POLICY pipeline_stage_transitions_insert ON public.pipeline_stage_transitions FOR INSERT
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.jobs j
             WHERE j.id = pipeline_stage_transitions.job_id
               AND j.organisation_id = (SELECT public.auth_organisation_id()))
     AND (SELECT public.auth_role()) = ANY (ARRAY['leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role]))
    OR ((SELECT public.auth_role()) = 'agency'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    JOIN public.agency_clients ac ON ac.client_organisation_id = j.organisation_id
                    WHERE j.id = pipeline_stage_transitions.job_id
                      AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                      AND public.agency_client_link_is_live(ac.status, ac.is_active)))
    OR ((SELECT public.auth_role()) = 'hiring_manager'::public.app_role
        AND EXISTS (SELECT 1 FROM public.jobs j
                    WHERE j.id = pipeline_stage_transitions.job_id
                      AND j.hiring_manager_id = (SELECT auth.uid())))
    OR (SELECT public.auth_role()) = 'super_admin'::public.app_role
  );

DROP POLICY IF EXISTS "Agency can read linked client unlocks" ON public.candidate_unlocks;
CREATE POLICY "Agency can read linked client unlocks" ON public.candidate_unlocks FOR SELECT
  USING (
    organisation_id IN (
      SELECT ac.client_organisation_id FROM public.agency_clients ac
      WHERE ac.agency_organisation_id = (SELECT public.auth_organisation_id())
        AND public.agency_client_link_is_live(ac.status, ac.is_active)
    )
  );

DROP POLICY IF EXISTS "Company can read linked agency unlocks" ON public.candidate_unlocks;
CREATE POLICY "Company can read linked agency unlocks" ON public.candidate_unlocks FOR SELECT
  USING (
    organisation_id IN (
      SELECT ac.agency_organisation_id FROM public.agency_clients ac
      WHERE ac.client_organisation_id = (SELECT public.auth_organisation_id())
        AND public.agency_client_link_is_live(ac.status, ac.is_active)
    )
  );

DROP POLICY IF EXISTS interview_slots_insert ON public.interview_availability_slots;
CREATE POLICY interview_slots_insert ON public.interview_availability_slots FOR INSERT
  WITH CHECK (
    (SELECT public.auth_role()) = ANY (ARRAY['super_admin'::public.app_role, 'leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role, 'hiring_manager'::public.app_role, 'interviewer'::public.app_role])
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = interview_availability_slots.job_id
        AND (
          (SELECT public.auth_role()) = 'super_admin'::public.app_role
          OR j.organisation_id = (SELECT public.auth_organisation_id())
          OR ((SELECT public.auth_role()) = ANY (ARRAY['agency'::public.app_role, 'leadership'::public.app_role, 'recruiter'::public.app_role])
              AND EXISTS (SELECT 1 FROM public.agency_clients ac
                          WHERE ac.client_organisation_id = j.organisation_id
                            AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                            AND public.agency_client_link_is_live(ac.status, ac.is_active)))
        )
    )
    AND (
      user_id = (SELECT auth.uid())
      OR ((SELECT public.auth_role()) = ANY (ARRAY['super_admin'::public.app_role, 'leadership'::public.app_role, 'recruiter'::public.app_role, 'agency'::public.app_role, 'hiring_manager'::public.app_role])
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = interview_availability_slots.user_id
              AND (
                p.organisation_id = (SELECT public.auth_organisation_id())
                OR EXISTS (SELECT 1 FROM public.agency_clients ac
                           WHERE ac.client_organisation_id = p.organisation_id
                             AND ac.agency_organisation_id = (SELECT public.auth_organisation_id())
                             AND public.agency_client_link_is_live(ac.status, ac.is_active))
              )
          ))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. assertion — fail the migration rather than leave a reader ungated
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ungated text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
  INTO ungated
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename <> 'agency_clients'
    AND (qual ILIKE '%agency_clients%' OR with_check ILIKE '%agency_clients%')
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT ILIKE '%agency_client_link_is_live%';

  IF ungated IS NOT NULL THEN
    RAISE EXCEPTION 'agency_clients consent gate missing on: %', ungated;
  END IF;
END $$;

COMMIT;
