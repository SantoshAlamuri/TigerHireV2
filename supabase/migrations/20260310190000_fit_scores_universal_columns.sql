-- Universal 3-dimension model: scope, impact, autonomy → deterministic 0–100 score.
-- universal_score: (scope + impact + autonomy) / 30 * 100.
-- universal_dimensions: JSONB with scope/impact/autonomy each { rating, evidence }.
-- universal_reasoning: one-sentence summary from the model.
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS universal_score INTEGER;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS universal_dimensions JSONB;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS universal_reasoning TEXT;
