-- Interview scheduling: recruiter availability slots and bookings.
-- Recruiters create slots per job; candidates/recruiters book a slot → pipeline_candidates.interview_scheduled_at is set.

BEGIN;

CREATE TABLE interview_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
  pipeline_candidate_id uuid REFERENCES pipeline_candidates (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_slots_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_interview_slots_job_id ON interview_availability_slots (job_id);
CREATE INDEX idx_interview_slots_user_id ON interview_availability_slots (user_id);
CREATE INDEX idx_interview_slots_start_at ON interview_availability_slots (start_at);
CREATE INDEX idx_interview_slots_status ON interview_availability_slots (job_id, status) WHERE status = 'available';

COMMENT ON TABLE interview_availability_slots IS 'Recruiter-defined availability slots per job; status=booked when pipeline_candidate_id is set.';

ALTER TABLE interview_availability_slots ENABLE ROW LEVEL SECURITY;

-- Recruiters can manage slots for jobs in their org; can read slots for their org's jobs.
CREATE POLICY "Recruiters can insert slots for own org jobs"
  ON interview_availability_slots FOR INSERT
  WITH CHECK (
    public.auth_role() IN ('company_admin', 'recruiter', 'agency', 'hiring_manager', 'super_admin')
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = interview_availability_slots.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Recruiters can update own slots"
  ON interview_availability_slots FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = interview_availability_slots.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "Recruiters can delete own slots"
  ON interview_availability_slots FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = interview_availability_slots.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

CREATE POLICY "Recruiters can read slots for org jobs"
  ON interview_availability_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = interview_availability_slots.job_id
      AND (jobs.organisation_id = public.auth_organisation_id() OR public.auth_role() = 'super_admin')
    )
  );

COMMIT;
