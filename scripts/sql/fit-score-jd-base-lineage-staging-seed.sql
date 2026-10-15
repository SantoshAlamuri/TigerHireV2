-- Staging backfill fixture for 20260605120000_fit_scores_jd_base_lineage.sql
-- Target: qzhhhsvtyqyixpcdfhng (TigerHire-Staging)
--
-- Staging has 0 v2 fit_scores today, so supabase db push alone cannot exercise the
-- two-branch backfill UPDATE. Run this seed BEFORE applying the migration, then
-- run fit-score-jd-base-lineage-staging-verify.sql after.
--
-- Creates one job + JD Base (approved 2026-06-01) and two v2 scores on the same job:
--   pre-approval  (created 2026-05-15) → should land unknown_pre_approval + NULL version
--   post-approval (created 2026-06-05) → should land backfill_accurate + current version

-- Cleanup prior fixture rows (idempotent re-run)
DELETE FROM public.fit_scores
WHERE id IN (
  'a1000000-0000-4000-8000-000000000201',
  'a1000000-0000-4000-8000-000000000202'
);

DELETE FROM public.jd_base_documents
WHERE id = 'a1000000-0000-4000-8000-000000000102';

DELETE FROM public.candidates
WHERE id = 'a1000000-0000-4000-8000-000000000103';

DELETE FROM public.jobs
WHERE id = 'a1000000-0000-4000-8000-000000000101';

-- Fixture job (org from existing staging Demo JD job)
INSERT INTO public.jobs (
  id,
  organisation_id,
  title,
  description,
  status,
  show_salary,
  created_at,
  updated_at
)
VALUES (
  'a1000000-0000-4000-8000-000000000101',
  '2716ae2d-41b0-4505-be8a-2e0da281cb37',
  'Lineage backfill fixture job',
  'Synthetic job for JD Base lineage migration backfill test.',
  'open',
  false,
  '2026-05-01 10:00:00+00',
  '2026-05-01 10:00:00+00'
);

INSERT INTO public.jd_base_documents (
  id,
  job_id,
  role_title,
  company,
  context,
  weights,
  score_floor,
  fit_thresholds,
  approved_by,
  approved_at,
  version,
  created_at,
  updated_at
)
VALUES (
  'a1000000-0000-4000-8000-000000000102',
  'a1000000-0000-4000-8000-000000000101',
  'Lineage backfill fixture job',
  'TigerHire Staging',
  'Fixture JD Base for migration backfill branch test.',
  '{"test_automation": 25, "tools": 10, "programming": 10}'::jsonb,
  15,
  '{"strong": 78, "good": 60, "moderate": 40, "weak": 25}'::jsonb,
  NULL,
  '2026-06-01 12:00:00+00',
  2,
  '2026-05-01 10:00:00+00',
  '2026-06-01 12:00:00+00'
);

-- Second candidate (first uses existing staging candidate if present)
INSERT INTO public.candidates (
  id,
  visibility,
  full_name,
  created_at,
  updated_at
)
VALUES (
  'a1000000-0000-4000-8000-000000000103',
  'private',
  'Lineage fixture candidate (post-approval)',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Pre-approval v2 score (existing staging candidate)
INSERT INTO public.fit_scores (
  id,
  job_id,
  candidate_id,
  overall_score,
  scoring_version,
  is_test_run,
  run_index,
  created_at,
  band,
  summary
)
SELECT
  'a1000000-0000-4000-8000-000000000201',
  'a1000000-0000-4000-8000-000000000101',
  c.id,
  42,
  2,
  false,
  1,
  '2026-05-15 10:00:00+00',
  'moderate',
  'Lineage fixture: scored before current JD approval'
FROM public.candidates c
ORDER BY c.created_at
LIMIT 1;

-- Post-approval v2 score (fixture candidate)
INSERT INTO public.fit_scores (
  id,
  job_id,
  candidate_id,
  overall_score,
  scoring_version,
  is_test_run,
  run_index,
  created_at,
  band,
  summary
)
VALUES (
  'a1000000-0000-4000-8000-000000000202',
  'a1000000-0000-4000-8000-000000000101',
  'a1000000-0000-4000-8000-000000000103',
  67,
  2,
  false,
  1,
  '2026-06-05 10:00:00+00',
  'good',
  'Lineage fixture: scored after current JD approval'
);

-- Pre-migration sanity (expect jd_base_document_id column absent or all NULL)
SELECT
  id,
  created_at,
  scoring_version,
  jd_base_document_id,
  jd_base_version
FROM public.fit_scores
WHERE job_id = 'a1000000-0000-4000-8000-000000000101'
ORDER BY created_at;
