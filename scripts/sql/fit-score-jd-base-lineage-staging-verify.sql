-- Post-migration verify for staging backfill fixture
-- Target: qzhhhsvtyqyixpcdfhng
-- Run AFTER: seed script + supabase db push (20260605120000_fit_scores_jd_base_lineage.sql)
--
-- Expect exactly 1 accurate + 1 unknown_pre_approval on the fixture job.
-- Staging totals will NOT match prod (159/154) — only this fixture split matters.

SELECT
  fs.id,
  fs.created_at,
  fs.jd_base_document_id,
  fs.jd_base_version,
  fs.rubric_snapshot ->> 'lineage_status' AS lineage_status,
  (fs.rubric_snapshot ? 'weights') AS snapshot_has_weights
FROM public.fit_scores fs
WHERE fs.job_id = 'a1000000-0000-4000-8000-000000000101'
ORDER BY fs.created_at;

SELECT
  count(*) FILTER (
    WHERE rubric_snapshot ->> 'lineage_status' = 'backfill_accurate'
  ) AS accurate_count,
  count(*) FILTER (
    WHERE rubric_snapshot ->> 'lineage_status' = 'unknown_pre_approval'
  ) AS unknown_count,
  count(*) FILTER (
    WHERE jd_base_document_id IS NOT NULL AND jd_base_version IS NULL
  ) AS linked_null_version_count
FROM public.fit_scores
WHERE job_id = 'a1000000-0000-4000-8000-000000000101';

-- Gate: raise if fixture split is wrong (run inside a transaction or inspect counts manually)
DO $$
DECLARE
  accurate int;
  unknown int;
  null_version int;
BEGIN
  SELECT
    count(*) FILTER (WHERE rubric_snapshot ->> 'lineage_status' = 'backfill_accurate'),
    count(*) FILTER (WHERE rubric_snapshot ->> 'lineage_status' = 'unknown_pre_approval'),
    count(*) FILTER (WHERE jd_base_document_id IS NOT NULL AND jd_base_version IS NULL)
  INTO accurate, unknown, null_version
  FROM public.fit_scores
  WHERE job_id = 'a1000000-0000-4000-8000-000000000101';

  IF accurate <> 1 OR unknown <> 1 OR null_version <> 1 THEN
    RAISE EXCEPTION
      'Staging fixture backfill failed: accurate=%, unknown=%, linked_null_version=% (expected 1/1/1)',
      accurate, unknown, null_version;
  END IF;

  RAISE NOTICE 'Staging fixture backfill OK: accurate=%, unknown=%, linked_null_version=%',
    accurate, unknown, null_version;
END $$;
