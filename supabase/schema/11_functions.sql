-- Semantic search: find candidates similar to a given embedding vector.
-- Used by FitScore Agent to find best-match candidates for a JD.

CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
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
  ORDER BY candidates.profile_embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Semantic search: find jobs similar to a given embedding vector.
-- Used for candidate-side matching (find roles that fit their profile).

CREATE OR REPLACE FUNCTION match_jobs(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT
    jobs.id,
    1 - (jobs.jd_embedding <=> query_embedding) AS similarity
  FROM jobs
  WHERE
    jobs.status = 'open'
    AND jobs.jd_embedding IS NOT NULL
    AND 1 - (jobs.jd_embedding <=> query_embedding) > match_threshold
  ORDER BY jobs.jd_embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Add unique index on waitlist email for upsert support.
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email_unique ON waitlist (email);
