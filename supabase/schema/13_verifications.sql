-- Verifications: WhatsApp verification flow (VerifyKit). One row per candidate verification attempt.
-- Step 1 = video intro, Step 2 = CV upload, Step 3 = details confirm, Step 4 = optional employer ping.

CREATE TABLE verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  step_1_video_url text,
  step_1_completed_at timestamptz,
  step_2_cv_url text,
  step_2_completed_at timestamptz,
  step_3_details jsonb,
  step_3_completed_at timestamptz,
  step_4_reference_contact text,
  step_4_completed_at timestamptz,
  badge verification_badge NOT NULL DEFAULT 'bronze',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verifications_candidate_id ON verifications (candidate_id);
CREATE INDEX idx_verifications_badge ON verifications (badge);
CREATE INDEX idx_verifications_completed_at ON verifications (completed_at) WHERE completed_at IS NOT NULL;

COMMENT ON TABLE verifications IS 'VerifyKit: WhatsApp verification progress. Bronze = WhatsApp confirmed; Silver = + video; Gold = + employer ping.';
