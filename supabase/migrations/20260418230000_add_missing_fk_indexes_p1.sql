-- P1: close clear FK index gaps with safe, additive indexes.
-- Scope intentionally limited to high-confidence missing FK columns.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_approval_tokens_approver_profile_id
  ON public.approval_tokens (approver_profile_id);

CREATE INDEX IF NOT EXISTS idx_offers_created_by
  ON public.offers (created_by);

CREATE INDEX IF NOT EXISTS idx_offer_approvals_approver_id
  ON public.offer_approvals (approver_id);

CREATE INDEX IF NOT EXISTS idx_assessments_stage_id
  ON public.assessments (stage_id)
  WHERE stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_reviewer_id
  ON public.assessments (reviewer_id)
  WHERE reviewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_created_by
  ON public.assessments (created_by)
  WHERE created_by IS NOT NULL;

COMMIT;
