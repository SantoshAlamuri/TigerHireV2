-- Remove duplicate pipeline rows (same job + candidate), keep the earliest created row.
DELETE FROM public.pipeline_candidates pc
WHERE pc.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY job_id, candidate_id
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.pipeline_candidates
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_candidates_job_id_candidate_id_unique
  ON public.pipeline_candidates (job_id, candidate_id);

COMMENT ON INDEX idx_pipeline_candidates_job_id_candidate_id_unique IS
  'One pipeline membership per candidate per job; prevents duplicate kanban cards.';
