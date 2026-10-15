-- Prod apply with count gate for 20260605120000_fit_scores_jd_base_lineage.sql
-- Target: htdyomyhkvhcwoeodwas (TigerHire prod)
--
-- Run as a SINGLE transaction in the SQL editor (or psql -f).
-- If counts do not match expectations, the block raises and the whole transaction rolls back.
--
-- Expected prod split (snapshot as of 2026-06-05):
--   v2 scores linkable to approved JD Base: 313
--   backfill_accurate (created_at >= approved_at): 159
--   unknown_pre_approval (created_at < approved_at): 154
--   v2 orphans (no approved JD Base): 0
--
-- Re-query the "pre-flight" section below before running if prod data may have changed.

-- --- Pre-flight (read-only; run outside transaction to confirm expectations) ---
-- SELECT
--   count(*) FILTER (WHERE fs.scoring_version >= 2 AND fs.created_at >= jbd.approved_at) AS would_accurate,
--   count(*) FILTER (WHERE fs.scoring_version >= 2 AND fs.created_at < jbd.approved_at) AS would_unknown,
--   count(*) FILTER (WHERE fs.scoring_version >= 2) AS v2_total
-- FROM fit_scores fs
-- JOIN jd_base_documents jbd ON jbd.job_id = fs.job_id
-- WHERE jbd.approved_at IS NOT NULL;

BEGIN;

-- === Migration DDL + backfill (identical to 20260605120000_fit_scores_jd_base_lineage.sql) ===

ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS jd_base_document_id uuid,
  ADD COLUMN IF NOT EXISTS jd_base_version integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fit_scores_jd_base_document_id_fkey'
  ) THEN
    ALTER TABLE public.fit_scores
      ADD CONSTRAINT fit_scores_jd_base_document_id_fkey
      FOREIGN KEY (jd_base_document_id)
      REFERENCES public.jd_base_documents (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fit_scores_jd_base_document_id
  ON public.fit_scores (jd_base_document_id)
  WHERE jd_base_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fit_scores_job_jd_base_version
  ON public.fit_scores (job_id, jd_base_version)
  WHERE jd_base_version IS NOT NULL;

COMMENT ON COLUMN public.fit_scores.jd_base_document_id IS
  'JD Base document used when this score was computed. FK resolves to current row; use jd_base_version + rubric_snapshot for point-in-time rubric.';

COMMENT ON COLUMN public.fit_scores.jd_base_version IS
  'jd_base_documents.version at score time. NULL = unknown (e.g. scored before current approval). Compare to current doc version to detect stale scores after re-approval.';

UPDATE public.fit_scores fs
SET
  jd_base_document_id = jbd.id,
  jd_base_version = jbd.version,
  rubric_snapshot = jsonb_build_object(
    'schema_version', 1,
    'lineage_status', 'backfill_accurate',
    'captured_at', fs.created_at,
    'jd_base_document_id', jbd.id,
    'jd_base_version', jbd.version,
    'job_id', jbd.job_id,
    'role_title', jbd.role_title,
    'company', jbd.company,
    'context', jbd.context,
    'weights', jbd.weights,
    'score_floor', jbd.score_floor,
    'fit_thresholds', jbd.fit_thresholds,
    'ideal_candidate_profile', jbd.ideal_candidate_profile,
    'structured_jd', jbd.structured_jd,
    'extraction_additions', jbd.extraction_additions,
    'approved_by', jbd.approved_by,
    'approved_at', jbd.approved_at,
    'backfill', true
  )
FROM public.jd_base_documents jbd
WHERE fs.job_id = jbd.job_id
  AND fs.scoring_version >= 2
  AND fs.jd_base_document_id IS NULL
  AND jbd.approved_at IS NOT NULL
  AND fs.created_at >= jbd.approved_at;

UPDATE public.fit_scores fs
SET
  jd_base_document_id = jbd.id,
  jd_base_version = NULL,
  rubric_snapshot = jsonb_build_object(
    'schema_version', 1,
    'lineage_status', 'unknown_pre_approval',
    'captured_at', fs.created_at,
    'jd_base_document_id', jbd.id,
    'job_id', jbd.job_id,
    'scored_at', fs.created_at,
    'current_doc_approved_at', jbd.approved_at,
    'current_doc_version', jbd.version,
    'backfill', true
  )
FROM public.jd_base_documents jbd
WHERE fs.job_id = jbd.job_id
  AND fs.scoring_version >= 2
  AND fs.jd_base_document_id IS NULL
  AND jbd.approved_at IS NOT NULL
  AND fs.created_at < jbd.approved_at;

-- === Count gate (prod-specific expectations) ===

DO $$
DECLARE
  expected_accurate constant int := 159;
  expected_unknown constant int := 154;
  expected_v2_linked constant int := 313;
  accurate int;
  unknown int;
  v2_linked int;
  v2_orphan int;
  null_version_linked int;
BEGIN
  SELECT
    count(*) FILTER (WHERE fs.rubric_snapshot ->> 'lineage_status' = 'backfill_accurate'),
    count(*) FILTER (WHERE fs.rubric_snapshot ->> 'lineage_status' = 'unknown_pre_approval'),
    count(*) FILTER (WHERE fs.scoring_version >= 2 AND fs.jd_base_document_id IS NOT NULL),
    count(*) FILTER (
      WHERE fs.jd_base_document_id IS NOT NULL AND fs.jd_base_version IS NULL
    )
  INTO accurate, unknown, v2_linked, null_version_linked
  FROM public.fit_scores fs;

  SELECT count(*)
  INTO v2_orphan
  FROM public.fit_scores fs
  LEFT JOIN public.jd_base_documents jbd ON jbd.job_id = fs.job_id
  WHERE fs.scoring_version >= 2
    AND fs.jd_base_document_id IS NULL
    AND (jbd.id IS NULL OR jbd.approved_at IS NULL);

  IF accurate <> expected_accurate
     OR unknown <> expected_unknown
     OR (accurate + unknown) <> expected_v2_linked
     OR v2_orphan <> 0
     OR null_version_linked <> expected_unknown THEN
    RAISE EXCEPTION
      'Prod backfill gate FAILED: accurate=% unknown=% linked=% orphan=% null_version=% (expected %/%/%/0/%)',
      accurate, unknown, v2_linked, v2_orphan, null_version_linked,
      expected_accurate, expected_unknown, expected_v2_linked, expected_unknown;
  END IF;

  RAISE NOTICE 'Prod backfill gate PASSED: accurate=% unknown=% linked=% orphan=% null_version=%',
    accurate, unknown, v2_linked, v2_orphan, null_version_linked;
END $$;

COMMIT;
