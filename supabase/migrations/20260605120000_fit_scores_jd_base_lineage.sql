-- Hybrid FitScore lineage: link each score to the JD Base rubric used at score time.
-- jd_base_document_id + jd_base_version enable stale detection after re-approval.
-- rubric_snapshot freezes weights/ICP so scores remain explainable after in-place doc updates.
--
-- Backfill splits on fs.created_at vs jbd.approved_at:
--   scored >= approval → reconstruct snapshot from current doc (rubric was in effect).
--   scored < approval  → unknown lineage; jd_base_version NULL so stale detector flags them.

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

-- Accurate backfill: score created at or after the current JD Base approval timestamp.
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

-- Unknown / likely stale: scored before the current approval; rubric at score time is not recoverable.
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
