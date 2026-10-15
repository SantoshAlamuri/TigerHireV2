-- Backfill historical hybrid v2 rows that omitted scoring_method (observability only).
-- Verified on prod (htdyomyhkvhcwoeodwas): 120 rows with scoring_version=2, scoring_method NULL,
-- all have v2_extraction and v2_explanation populated (not legacy three-stage).

UPDATE public.fit_scores
SET scoring_method = 'hybrid_merged'
WHERE scoring_version = 2
  AND scoring_method IS NULL
  AND v2_extraction IS NOT NULL
  AND v2_explanation IS NOT NULL;
