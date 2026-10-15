BEGIN;

CREATE OR REPLACE FUNCTION public.list_accessible_candidate_ids_page(
  p_organisation_ids uuid[],
  p_search text DEFAULT NULL,
  p_skills text[] DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_min_intent_score integer DEFAULT NULL,
  p_min_experience numeric DEFAULT NULL,
  p_max_experience numeric DEFAULT NULL,
  p_sort_by text DEFAULT 'intent_score',
  p_sort_order text DEFAULT 'desc',
  p_limit integer DEFAULT 20,
  p_page integer DEFAULT 1,
  p_cursor uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH filtered AS (
    SELECT
      c.id,
      c.intent_score,
      c.experience_years,
      c.created_at
    FROM public.candidates c
    WHERE c.visibility = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.candidate_unlocks cu
          WHERE cu.candidate_id = c.id
            AND cu.organisation_id = ANY(p_organisation_ids)
        )
        OR EXISTS (
          SELECT 1
          FROM public.fit_scores fs
          JOIN public.jobs j
            ON j.id = fs.job_id
          WHERE fs.candidate_id = c.id
            AND (fs.is_test_run = false OR fs.is_test_run IS NULL)
            AND j.organisation_id = ANY(p_organisation_ids)
        )
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR COALESCE(c.name, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.full_name, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.email, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.location, '') ILIKE '%' || p_search || '%'
      )
      AND (
        p_skills IS NULL
        OR cardinality(p_skills) = 0
        OR c.skills && p_skills
      )
      AND (
        p_location IS NULL
        OR p_location = ''
        OR COALESCE(c.location, '') ILIKE '%' || p_location || '%'
      )
      AND (
        p_min_intent_score IS NULL
        OR c.intent_score >= p_min_intent_score
      )
      AND (
        p_min_experience IS NULL
        OR c.experience_years >= p_min_experience
      )
      AND (
        p_max_experience IS NULL
        OR c.experience_years <= p_max_experience
      )
      AND (
        p_cursor IS NULL
        OR (
          lower(COALESCE(p_sort_order, 'desc')) = 'asc'
          AND c.id > p_cursor
        )
        OR (
          lower(COALESCE(p_sort_order, 'desc')) <> 'asc'
          AND c.id < p_cursor
        )
      )
  ),
  paged AS (
    SELECT
      filtered.id,
      count(*) OVER() AS total_count
    FROM filtered
    ORDER BY
      CASE
        WHEN p_sort_by = 'intent_score' AND lower(COALESCE(p_sort_order, 'desc')) = 'asc'
          THEN filtered.intent_score
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'intent_score' AND lower(COALESCE(p_sort_order, 'desc')) <> 'asc'
          THEN filtered.intent_score
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'experience_years' AND lower(COALESCE(p_sort_order, 'desc')) = 'asc'
          THEN filtered.experience_years
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'experience_years' AND lower(COALESCE(p_sort_order, 'desc')) <> 'asc'
          THEN filtered.experience_years
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'created_at' AND lower(COALESCE(p_sort_order, 'desc')) = 'asc'
          THEN filtered.created_at
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'created_at' AND lower(COALESCE(p_sort_order, 'desc')) <> 'asc'
          THEN filtered.created_at
      END DESC NULLS LAST,
      CASE
        WHEN lower(COALESCE(p_sort_order, 'desc')) = 'asc'
          THEN filtered.id
      END ASC,
      CASE
        WHEN lower(COALESCE(p_sort_order, 'desc')) <> 'asc'
          THEN filtered.id
      END DESC
    LIMIT CASE
      WHEN p_cursor IS NULL THEN GREATEST(p_limit, 1)
      ELSE GREATEST(p_limit, 1) + 1
    END
    OFFSET CASE
      WHEN p_cursor IS NULL THEN GREATEST((GREATEST(p_page, 1) - 1) * GREATEST(p_limit, 1), 0)
      ELSE 0
    END
  )
  SELECT
    paged.id,
    paged.total_count
  FROM paged;
$$;

COMMENT ON FUNCTION public.list_accessible_candidate_ids_page(uuid[], text, text[], text, integer, numeric, numeric, text, text, integer, integer, uuid)
IS 'Returns paginated candidate IDs accessible to the given orgs without building huge REST .in() clauses.';

COMMIT;
