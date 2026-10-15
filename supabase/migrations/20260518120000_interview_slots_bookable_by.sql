-- Who may book a slot: candidates (self-serve / WA), recruiters (in-app), or both.
ALTER TABLE public.interview_availability_slots
  ADD COLUMN IF NOT EXISTS bookable_by text NOT NULL DEFAULT 'both';

ALTER TABLE public.interview_availability_slots
  DROP CONSTRAINT IF EXISTS interview_availability_slots_bookable_by_check;

ALTER TABLE public.interview_availability_slots
  ADD CONSTRAINT interview_availability_slots_bookable_by_check
  CHECK (bookable_by IN ('candidate', 'interviewer', 'both'));

COMMENT ON COLUMN public.interview_availability_slots.bookable_by IS
  'candidate = self-serve/WA only; interviewer = recruiter in-app only; both = either path.';
