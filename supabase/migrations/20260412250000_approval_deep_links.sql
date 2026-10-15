-- A14: One-time email deep links for offer finance (and future hiring_request) approvals.

BEGIN;

CREATE TABLE IF NOT EXISTS public.approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  offer_id uuid REFERENCES public.offers (id) ON DELETE CASCADE,
  hiring_request_id uuid REFERENCES public.hiring_requests (id) ON DELETE CASCADE,
  approver_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve', 'reject')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (offer_id IS NOT NULL AND hiring_request_id IS NULL)
    OR (hiring_request_id IS NOT NULL AND offer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_approval_tokens_offer_used
  ON public.approval_tokens (offer_id, used_at)
  WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_tokens_hr_used
  ON public.approval_tokens (hiring_request_id, used_at)
  WHERE hiring_request_id IS NOT NULL;

COMMENT ON TABLE public.approval_tokens IS 'A14: single-use email deep-link tokens for approve/reject actions.';

ALTER TABLE public.approval_tokens ENABLE ROW LEVEL SECURITY;

COMMIT;
