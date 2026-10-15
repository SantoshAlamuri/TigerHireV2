-- Phase 2: Hiring manager approval gate for JD Base documents.
-- No scoring happens until a hiring manager reviews and approves the auto-generated weights.

ALTER TABLE public.jd_base_documents
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMENT ON COLUMN public.jd_base_documents.approved_by IS 'User who approved the JD Base for scoring. NULL = awaiting approval.';
COMMENT ON COLUMN public.jd_base_documents.approved_at IS 'Timestamp of approval. Scoring is blocked until this is set.';

CREATE INDEX IF NOT EXISTS idx_jd_base_approved ON public.jd_base_documents (approved_by) WHERE approved_by IS NULL;
