-- Add blend provenance columns: signal breakdown, matched keywords, reasoning text.

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS signal_breakdown JSONB;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS matched_keywords JSONB;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS blend_reasoning TEXT;

COMMENT ON COLUMN fit_scores.signal_breakdown IS 'Signal score breakdown: keywordMatch, ownershipLanguage, quantifiedOutcomes, etc.';
COMMENT ON COLUMN fit_scores.matched_keywords IS 'JD must-have keywords found in experience section (array of strings).';
COMMENT ON COLUMN fit_scores.blend_reasoning IS 'Human-readable reasoning for the 20% signal + 80% LLM blend.';
