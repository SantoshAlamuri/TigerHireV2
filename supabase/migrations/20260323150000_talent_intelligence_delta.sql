-- Talent Intelligence Delta: Ideal Profile + Market Score + Verdict
-- Builds on top of the existing v2 migration (20260323140000_jd_base_documents_hybrid_fitscore.sql)

-- 1. Add ideal_candidate_profile to jd_base_documents
ALTER TABLE public.jd_base_documents
  ADD COLUMN IF NOT EXISTS ideal_candidate_profile jsonb;

COMMENT ON COLUMN public.jd_base_documents.ideal_candidate_profile
  IS 'LLM-generated ideal candidate profile: summary, must_haves, nice_to_haves, years_range, benchmarks.';

-- 2. Add talent intelligence columns to fit_scores
ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS ideal_match_pct integer,
  ADD COLUMN IF NOT EXISTS ideal_gaps text[],
  ADD COLUMN IF NOT EXISTS market_percentile integer,
  ADD COLUMN IF NOT EXISTS market_pool_size integer,
  ADD COLUMN IF NOT EXISTS market_label text,
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS verdict_action text;

COMMENT ON COLUMN public.fit_scores.ideal_match_pct IS 'Percentage match against the ideal candidate profile (0-100).';
COMMENT ON COLUMN public.fit_scores.ideal_gaps IS 'Specific gaps vs the ideal candidate profile.';
COMMENT ON COLUMN public.fit_scores.market_percentile IS 'Candidate percentile rank within same role_category pool.';
COMMENT ON COLUMN public.fit_scores.market_pool_size IS 'Total candidates in the market comparison pool.';
COMMENT ON COLUMN public.fit_scores.market_label IS 'Human-readable market position label (e.g. Top 10% - Rare).';
COMMENT ON COLUMN public.fit_scores.verdict IS 'Talent intelligence verdict: Strong Hire / Safe Hire / Hidden Gem / Niche Talent / Pass.';
COMMENT ON COLUMN public.fit_scores.verdict_action IS 'Recommended recruiter action based on verdict.';

-- 3. Materialized view for market score pools (optional, for speed)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.market_score_pools AS
SELECT
  j.role_function,
  fs.overall_score,
  fs.candidate_id,
  fs.job_id,
  fs.created_at
FROM public.fit_scores fs
JOIN public.jobs j ON fs.job_id = j.id
WHERE fs.scoring_version = 2
  AND fs.created_at > now() - interval '6 months';

CREATE INDEX IF NOT EXISTS idx_msp_role_function ON public.market_score_pools (role_function);
