-- Migration: Create default pipeline stages for existing jobs that lack them,
-- and link existing pipeline_candidates to the appropriate stage.

BEGIN;

-- Create default stages for every job that has no custom stages yet.
INSERT INTO pipeline_stages (job_id, stage_name, stage_order)
SELECT j.id, s.stage_name, s.stage_order
FROM jobs j
CROSS JOIN (
  VALUES
    ('Applied',    1),
    ('Screening',  2),
    ('Interview',  3),
    ('Offer',      4),
    ('Hired',      5)
) AS s(stage_name, stage_order)
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages ps WHERE ps.job_id = j.id
);

-- For pipeline_candidates with stage_id IS NULL, assign to the first stage of their job.
UPDATE pipeline_candidates pc
SET stage_id = (
  SELECT ps.id
  FROM pipeline_stages ps
  WHERE ps.job_id = pc.job_id
  ORDER BY ps.stage_order ASC
  LIMIT 1
)
WHERE pc.stage_id IS NULL
  AND EXISTS (
    SELECT 1 FROM pipeline_stages ps2 WHERE ps2.job_id = pc.job_id
  );

COMMIT;
