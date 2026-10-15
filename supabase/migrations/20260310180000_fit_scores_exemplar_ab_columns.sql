-- A/B: store legacy (current) score and exemplar (3-run) score for comparison.
-- legacy_score: score from current primary scorer (e.g. simple exemplar).
-- exemplar_score: average of 3 exemplar runs, or legacy if variance > 10.
-- exemplar_variance: [run1, run2, run3] for stability analysis.
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS legacy_score INTEGER;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS exemplar_score INTEGER;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS exemplar_variance JSONB;
