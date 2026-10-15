-- Optional deadline for accepting new applications; used for candidate reminders (A2).

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS applications_close_at timestamptz;

COMMENT ON COLUMN public.jobs.applications_close_at IS
  'When set, applications are expected to stop after this instant; used to nudge existing applicants.';

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS app_close_reminder_7d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS app_close_reminder_24h_sent_at timestamptz;

COMMENT ON COLUMN public.applications.app_close_reminder_7d_sent_at IS
  'Set when a 7-day (168h) job application deadline reminder was sent to the candidate.';
COMMENT ON COLUMN public.applications.app_close_reminder_24h_sent_at IS
  'Set when a 24-hour job application deadline reminder was sent to the candidate.';

CREATE INDEX IF NOT EXISTS idx_jobs_open_applications_close_at
  ON public.jobs (applications_close_at)
  WHERE status = 'open' AND applications_close_at IS NOT NULL;
