-- REQ-WF-003: On Hold decision requires reason and planned resume date (BRD/PRD).

BEGIN;

ALTER TABLE public.hiring_requests
  ADD COLUMN IF NOT EXISTS on_hold_reason text,
  ADD COLUMN IF NOT EXISTS on_hold_resume_at date;

COMMENT ON COLUMN public.hiring_requests.on_hold_reason IS 'Why the requisition was placed on hold (TA/approver).';
COMMENT ON COLUMN public.hiring_requests.on_hold_resume_at IS 'Date the workflow is expected to resume review.';

COMMIT;
