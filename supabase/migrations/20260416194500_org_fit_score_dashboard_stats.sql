-- Accurate org-level FitScore aggregates for dashboards (latest score per job–candidate pair).
CREATE OR REPLACE FUNCTION public.get_org_fit_score_dashboard_stats(p_org_id uuid)
RETURNS TABLE (
  pair_count bigint,
  unique_candidate_count bigint,
  strong_match_count bigint,
  avg_overall numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (fs.job_id, fs.candidate_id)
      fs.candidate_id,
      fs.overall_score::numeric AS overall_score
    FROM public.fit_scores fs
    INNER JOIN public.jobs j ON j.id = fs.job_id
    WHERE j.organisation_id = p_org_id
      AND (fs.is_test_run = false OR fs.is_test_run IS NULL)
    ORDER BY fs.job_id, fs.candidate_id, fs.created_at DESC NULLS LAST
  ),
  scored AS (
    SELECT * FROM latest WHERE overall_score IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM scored) AS pair_count,
    (SELECT COUNT(DISTINCT candidate_id)::bigint FROM scored) AS unique_candidate_count,
    (SELECT COUNT(*)::bigint FROM scored WHERE overall_score >= 80) AS strong_match_count,
    (SELECT ROUND(AVG(overall_score)) FROM scored) AS avg_overall;
$$;

REVOKE ALL ON FUNCTION public.get_org_fit_score_dashboard_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_fit_score_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_fit_score_dashboard_stats(uuid) TO service_role;
