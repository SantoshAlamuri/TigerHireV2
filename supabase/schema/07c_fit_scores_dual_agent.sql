-- Dual-agent scoring: method, agent A/B scores and reasoning, reconciler, gap, key_strengths, key_gaps, one_line_summary.

ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_a_score smallint;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_a_verdict text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_a_reasoning text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_b_score smallint;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_b_verdict text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS agent_b_reasoning text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS reconciler_reasoning text;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS gap smallint;
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS key_strengths text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS key_gaps text[];
ALTER TABLE fit_scores ADD COLUMN IF NOT EXISTS one_line_summary text;

COMMENT ON COLUMN fit_scores.method IS 'Dual-agent: consensus | weighted | arbitrated';
COMMENT ON COLUMN fit_scores.agent_a_score IS 'Skills assessor score (0-100)';
COMMENT ON COLUMN fit_scores.agent_a_verdict IS 'Skills assessor verdict (strong|partial|weak|none)';
COMMENT ON COLUMN fit_scores.agent_a_reasoning IS 'Skills assessor chain-of-thought reasoning';
COMMENT ON COLUMN fit_scores.agent_b_score IS 'Fit evaluator score (0-100); null if fallback to A only';
COMMENT ON COLUMN fit_scores.agent_b_verdict IS 'Fit evaluator verdict (natural|good|stretch|poor)';
COMMENT ON COLUMN fit_scores.agent_b_reasoning IS 'Fit evaluator chain-of-thought reasoning';
COMMENT ON COLUMN fit_scores.reconciler_reasoning IS 'Arbiter reasoning when method=arbitrated; fallback message when only A ran';
COMMENT ON COLUMN fit_scores.gap IS 'Absolute difference between agent A and B scores';
COMMENT ON COLUMN fit_scores.key_strengths IS 'Merged strongest_signal from both agents';
COMMENT ON COLUMN fit_scores.key_gaps IS 'Merged biggest_gap/biggest_concern from both agents';
COMMENT ON COLUMN fit_scores.one_line_summary IS 'Single-line summary for recruiter';
