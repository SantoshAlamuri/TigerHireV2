-- Peer review (Sonnet + Opus in 50-85 band): store pass scores, divergence, human review flag.
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS peer_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS pass1_score smallint CHECK (pass1_score IS NULL OR (pass1_score >= 0 AND pass1_score <= 100));
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS pass2_score smallint CHECK (pass2_score IS NULL OR (pass2_score >= 0 AND pass2_score <= 100));
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS divergence smallint CHECK (divergence IS NULL OR divergence >= 0);
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS human_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS human_review_reason text;

COMMENT ON COLUMN fit_scores.peer_reviewed IS 'True when Opus peer review ran (score was in 50-85 band).';
COMMENT ON COLUMN fit_scores.pass1_score IS 'Sonnet first-pass overall score (when peer review ran).';
COMMENT ON COLUMN fit_scores.pass2_score IS 'Opus peer-review overall score (when peer review ran).';
COMMENT ON COLUMN fit_scores.divergence IS '|pass1_score - pass2_score| when peer review ran.';
COMMENT ON COLUMN fit_scores.human_review_required IS 'Flag for recruiter: AI uncertain or borderline score.';
COMMENT ON COLUMN fit_scores.human_review_reason IS 'Reason for human review (e.g. scores diverged, borderline band).';
