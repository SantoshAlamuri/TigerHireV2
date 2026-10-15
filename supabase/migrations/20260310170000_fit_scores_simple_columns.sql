-- Add columns for exemplar (simple) fit score storage.
-- simple_score: score from single-prompt exemplar calibration.
-- simple_reasoning: one-sentence explanation from the model.
-- prompt_version: e.g. simple-v1.0 for reproducibility.
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS simple_score INTEGER;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS simple_reasoning TEXT;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS prompt_version TEXT;
