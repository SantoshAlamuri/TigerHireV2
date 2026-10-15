-- FitScore three-stage architecture: rubric cache, evidence cache, and extended fit_scores.
-- Stage 1 cache: one row per job (RoleIntelligence). Stage 2 cache: one row per candidate per job (CandidateIntelligence).

-- Stage 1 cache: locked rubric per job
CREATE TABLE IF NOT EXISTS fit_score_rubrics (
  job_id uuid NOT NULL PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  role_intelligence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fit_score_rubrics IS 'Three-stage FitScore: Stage 1 Role Intelligence cache per job. role_intelligence = full RoleIntelligence JSON (criteria, evidence_rules, weights sum 100).';

-- Stage 2 cache: candidate evidence per job
CREATE TABLE IF NOT EXISTS fit_score_evidence (
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  candidate_intelligence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, job_id)
);

COMMENT ON TABLE fit_score_evidence IS 'Three-stage FitScore: Stage 2 Candidate Intelligence cache per candidate per job. candidate_intelligence = full CandidateIntelligence JSON (evidence per criterion).';

CREATE INDEX IF NOT EXISTS idx_fit_score_evidence_job_id ON fit_score_evidence (job_id);

-- Extend fit_scores with three-stage columns (add if not present)
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS band text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS criteria_breakdown jsonb;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS provenance_hash text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS scoring_formula text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS rubric_snapshot jsonb;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb;

COMMENT ON COLUMN fit_scores.band IS 'Three-stage: Strong Fit | Good Fit | Moderate Fit | Weak Fit | Not a Fit';
COMMENT ON COLUMN fit_scores.confidence IS 'Three-stage: high | medium | low from parse_quality and profile_completeness';
COMMENT ON COLUMN fit_scores.criteria_breakdown IS 'Three-stage: array of { criterion_id, criterion_name, weight, grade, points_earned, evidence_text, evidence_rule_matched }';
COMMENT ON COLUMN fit_scores.provenance_hash IS 'SHA256 of inputs + model/prompt versions for audit';
COMMENT ON COLUMN fit_scores.scoring_formula IS 'Human-readable formula e.g. Criterion(A): 100 x 30/100 = 30 + ...';
COMMENT ON COLUMN fit_scores.rubric_snapshot IS 'Full RoleIntelligence at time of scoring (do not reference by ID)';
COMMENT ON COLUMN fit_scores.evidence_snapshot IS 'Full CandidateIntelligence at time of scoring (do not reference by ID)';

-- RLS: same pattern as fit_scores — org members can read rubrics/evidence for their jobs
ALTER TABLE fit_score_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fit_score_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read rubrics for their jobs"
  ON fit_score_rubrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = fit_score_rubrics.job_id
      AND jobs.organisation_id = ANY(public.auth_organisation_ids())
    )
  );

CREATE POLICY "Super admins can read all rubrics"
  ON fit_score_rubrics FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT/UPDATE fit_score_rubrics via service role only (scoring pipeline)

CREATE POLICY "Org members can read evidence for their jobs"
  ON fit_score_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = fit_score_evidence.job_id
      AND jobs.organisation_id = ANY(public.auth_organisation_ids())
    )
  );

CREATE POLICY "Super admins can read all evidence"
  ON fit_score_evidence FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- INSERT/UPDATE fit_score_evidence via service role only (scoring pipeline)
