-- Hybrid search: add optional metadata filters to match_candidates (location, experience band).
-- Uses existing indexes on candidates.location and candidates.experience_years where applicable.

CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20,
  intent_min smallint DEFAULT NULL,
  location_filter text DEFAULT NULL,
  experience_min numeric DEFAULT NULL,
  experience_max numeric DEFAULT NULL
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT
    candidates.id,
    1 - (candidates.profile_embedding <=> query_embedding) AS similarity
  FROM candidates
  WHERE
    candidates.visibility = true
    AND candidates.profile_embedding IS NOT NULL
    AND 1 - (candidates.profile_embedding <=> query_embedding) > match_threshold
    AND (intent_min IS NULL OR candidates.intent_score IS NULL OR candidates.intent_score >= intent_min)
    AND (location_filter IS NULL OR candidates.location IS NULL OR trim(candidates.location) = trim(location_filter))
    AND (experience_min IS NULL OR candidates.experience_years IS NULL OR candidates.experience_years >= experience_min)
    AND (experience_max IS NULL OR candidates.experience_years IS NULL OR candidates.experience_years <= experience_max)
  ORDER BY candidates.profile_embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_candidates(vector(1536), float, int, smallint, text, numeric, numeric) IS
  'Semantic search with optional hybrid filters: intent_min, location_filter (exact match), experience_min/experience_max. Uses ivfflat index.';
