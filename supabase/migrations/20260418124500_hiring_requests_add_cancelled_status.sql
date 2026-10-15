BEGIN;

ALTER TABLE public.hiring_requests
  DROP CONSTRAINT IF EXISTS hiring_requests_status_check;

ALTER TABLE public.hiring_requests
  ADD CONSTRAINT hiring_requests_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'on_hold',
    'converted',
    'cancelled'
  ));

COMMIT;
