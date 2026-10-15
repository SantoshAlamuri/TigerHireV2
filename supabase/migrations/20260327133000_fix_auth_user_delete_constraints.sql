-- Allow deleting auth.users rows without FK violations.
-- Keep historical/audit records by nulling actor references.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_log_actor_user_id_fkey'
      AND conrelid = 'public.audit_log'::regclass
  ) THEN
    ALTER TABLE public.audit_log
      DROP CONSTRAINT audit_log_actor_user_id_fkey;
  END IF;
END $$;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jd_base_documents_approved_by_fkey'
      AND conrelid = 'public.jd_base_documents'::regclass
  ) THEN
    ALTER TABLE public.jd_base_documents
      DROP CONSTRAINT jd_base_documents_approved_by_fkey;
  END IF;
END $$;

ALTER TABLE public.jd_base_documents
  ADD CONSTRAINT jd_base_documents_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
