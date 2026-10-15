-- Remove remaining auth.users delete blockers.
-- Historical actor references should remain but become NULL when a user is deleted.

ALTER TABLE public.feedback_responses
  ALTER COLUMN submitted_by DROP NOT NULL;

ALTER TABLE public.hiring_requests
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.shortlist_approvals
  ALTER COLUMN approver_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_form_templates_created_by_fkey'
      AND conrelid = 'public.feedback_form_templates'::regclass
  ) THEN
    ALTER TABLE public.feedback_form_templates
      DROP CONSTRAINT feedback_form_templates_created_by_fkey;
  END IF;
END $$;

ALTER TABLE public.feedback_form_templates
  ADD CONSTRAINT feedback_form_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_responses_submitted_by_fkey'
      AND conrelid = 'public.feedback_responses'::regclass
  ) THEN
    ALTER TABLE public.feedback_responses
      DROP CONSTRAINT feedback_responses_submitted_by_fkey;
  END IF;
END $$;

ALTER TABLE public.feedback_responses
  ADD CONSTRAINT feedback_responses_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hiring_requests_created_by_fkey'
      AND conrelid = 'public.hiring_requests'::regclass
  ) THEN
    ALTER TABLE public.hiring_requests
      DROP CONSTRAINT hiring_requests_created_by_fkey;
  END IF;
END $$;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hiring_requests_reviewed_by_fkey'
      AND conrelid = 'public.hiring_requests'::regclass
  ) THEN
    ALTER TABLE public.hiring_requests
      DROP CONSTRAINT hiring_requests_reviewed_by_fkey;
  END IF;
END $$;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orchestrator_runs_started_by_fkey'
      AND conrelid = 'public.orchestrator_runs'::regclass
  ) THEN
    ALTER TABLE public.orchestrator_runs
      DROP CONSTRAINT orchestrator_runs_started_by_fkey;
  END IF;
END $$;

ALTER TABLE public.orchestrator_runs
  ADD CONSTRAINT orchestrator_runs_started_by_fkey
  FOREIGN KEY (started_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resume_versions_uploaded_by_fkey'
      AND conrelid = 'public.resume_versions'::regclass
  ) THEN
    ALTER TABLE public.resume_versions
      DROP CONSTRAINT resume_versions_uploaded_by_fkey;
  END IF;
END $$;

ALTER TABLE public.resume_versions
  ADD CONSTRAINT resume_versions_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shortlist_approvals_approver_id_fkey'
      AND conrelid = 'public.shortlist_approvals'::regclass
  ) THEN
    ALTER TABLE public.shortlist_approvals
      DROP CONSTRAINT shortlist_approvals_approver_id_fkey;
  END IF;
END $$;

ALTER TABLE public.shortlist_approvals
  ADD CONSTRAINT shortlist_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES auth.users(id) ON DELETE SET NULL;
