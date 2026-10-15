BEGIN;

WITH ranked_active AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organisation_id, candidate_id, req_id
      ORDER BY
        CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.screening_jobs
  WHERE status IN ('queued', 'awaiting_consent', 'in_progress')
),
to_cancel AS (
  SELECT id
  FROM ranked_active
  WHERE rn > 1
)
UPDATE public.screening_jobs sj
SET
  status = 'cancelled',
  ended_at = COALESCE(sj.ended_at, now()),
  updated_at = now()
WHERE sj.id IN (SELECT id FROM to_cancel);

CREATE UNIQUE INDEX IF NOT EXISTS screening_jobs_single_active_path_idx
  ON public.screening_jobs (organisation_id, candidate_id, req_id)
  WHERE status IN ('queued', 'awaiting_consent', 'in_progress');

COMMIT;
