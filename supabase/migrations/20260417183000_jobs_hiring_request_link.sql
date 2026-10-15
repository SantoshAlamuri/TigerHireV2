-- Link jobs back to the hiring request (requisition) that opened the role.

BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS hiring_request_id uuid REFERENCES public.hiring_requests (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_hiring_request_id ON public.jobs (hiring_request_id)
  WHERE hiring_request_id IS NOT NULL;

COMMENT ON COLUMN public.jobs.hiring_request_id IS
  'Source requisition when this job was created or linked from a hiring request.';

UPDATE public.jobs j
SET hiring_request_id = hr.id
FROM public.hiring_requests hr
WHERE hr.assigned_job_id = j.id
  AND j.hiring_request_id IS NULL;

COMMIT;
