-- Fix Supabase linter: function_search_path_mutable (0011).
-- Set search_path on match_candidates so it is not role-mutable.

CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20,
  intent_min smallint DEFAULT NULL
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
SET search_path = public
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
  ORDER BY candidates.profile_embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_candidates(vector(1536), float, int, smallint) IS
  'Semantic search: candidates similar to JD. intent_min filters by intent_score (e.g. 40). Uses ivfflat index — does not scan full table. At 100k+ candidates consider increasing idx_candidates_profile_embedding lists (e.g. 500-1000).';
