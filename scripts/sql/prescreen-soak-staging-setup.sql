-- Prescreen gate soak: STAGING fixture setup (idempotent, DML-only)
-- Project: qzhhhsvtyqyixpcdfhng (staging)
-- Run in Supabase SQL editor with service role.
--
-- POLICY / DDL SAFETY (verified against prescreen-soak-bank-setup.sql):
--   - No CREATE/DROP/ALTER POLICY
--   - No CREATE TABLE / migration DDL
--   - Data writes only: jd_base_documents, jd_requirements, prescreen_questions
--
-- IDEMPOTENCY (safe to re-run for fixture refresh):
--   - jd_base_documents: UPSERT on job_id (ON CONFLICT DO UPDATE)
--   - jd_requirements: DELETE-by-jd-base then INSERT (3 rows)
--   - prescreen_questions: DELETE-by-jd-base then INSERT (3 rows)
--   - prescreen_responses referencing deleted questions: CASCADE on question delete
--   - Does NOT delete applications, prescreen_sessions, or fit_scores from prior soaks
--
-- Does NOT flip ff_whatsapp_gate (staging global is already ON).
--
-- Target job: Demo JD for Hiring Manager (Finstack, open)
--   job_id:       1efb213a-5c92-4db4-a0d9-5fa0268b25c1
--   org_id:       2716ae2d-41b0-4505-be8a-2e0da281cb37  (slug: finstack)
--   approved_by:  6ea005da-5ae5-4c78-8840-ae0d9c73f932  (Kavita Rao, hiring_manager)
--
-- After this script: approved JD Base + 3 must-haves + 3 gating prescreen questions.

BEGIN;

-- Pre-flight: fail fast instead of partial insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid
      AND organisation_id = '2716ae2d-41b0-4505-be8a-2e0da281cb37'::uuid
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Staging soak job missing or not open: 1efb213a-5c92-4db4-a0d9-5fa0268b25c1 (Finstack)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = '6ea005da-5ae5-4c78-8840-ae0d9c73f932'::uuid
      AND organisation_id = '2716ae2d-41b0-4505-be8a-2e0da281cb37'::uuid
  ) THEN
    RAISE EXCEPTION 'Staging approved_by profile missing: 6ea005da-5ae5-4c78-8840-ae0d9c73f932';
  END IF;
END $$;

INSERT INTO public.jd_base_documents (
  job_id,
  role_title,
  company,
  context,
  weights,
  score_floor,
  fit_thresholds,
  structured_jd,
  version,
  approved_by,
  approved_at,
  updated_at
)
VALUES (
  '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid,
  'Demo JD for Hiring Manager',
  'Finstack',
  'Prescreen soak test job. Score against stated must-haves; gate asks yes/no on each.',
  '{"tools":20,"years_exp":25,"domain_fit":30,"communication":15,"ownership":10}'::jsonb,
  10,
  '{"strong": 78, "good": 60, "moderate": 40, "weak": 25}'::jsonb,
  jsonb_build_object(
    'must_haves', jsonb_build_array(
      '3+ years experience in a relevant professional role',
      'Eligible to work in India without visa sponsorship',
      'Available to start within 60 days'
    ),
    'need_to_haves', '[]'::jsonb,
    'nice_to_haves', '[]'::jsonb,
    'responsibilities', '[]'::jsonb,
    'role_basics', '{}'::jsonb
  ),
  1,
  '6ea005da-5ae5-4c78-8840-ae0d9c73f932'::uuid,
  now(),
  now()
)
ON CONFLICT (job_id) DO UPDATE SET
  role_title = EXCLUDED.role_title,
  company = EXCLUDED.company,
  context = EXCLUDED.context,
  weights = EXCLUDED.weights,
  structured_jd = EXCLUDED.structured_jd,
  approved_by = EXCLUDED.approved_by,
  approved_at = COALESCE(public.jd_base_documents.approved_at, EXCLUDED.approved_at),
  updated_at = now();

-- Delete children before requirements (questions FK → requirements ON DELETE SET NULL)
DELETE FROM public.prescreen_questions pq
WHERE pq.jd_base_document_id = (
  SELECT id FROM public.jd_base_documents
  WHERE job_id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid
);

DELETE FROM public.jd_requirements r
WHERE r.jd_base_document_id = (
  SELECT id FROM public.jd_base_documents
  WHERE job_id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid
);

INSERT INTO public.jd_requirements (jd_base_document_id, tier, kind, verifiable, text, weight)
SELECT jbd.id, 'must_have', 'other', true, v.text, NULL
FROM public.jd_base_documents jbd
CROSS JOIN (VALUES
  ('3+ years experience in a relevant professional role'),
  ('Eligible to work in India without visa sponsorship'),
  ('Available to start within 60 days')
) AS v(text)
WHERE jbd.job_id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid;

INSERT INTO public.prescreen_questions (
  jd_base_document_id, requirement_id, question_text, answer_type, options, gating
)
SELECT
  r.jd_base_document_id,
  r.id,
  'Do you meet this requirement: ' || r.text || '?',
  'yes_no',
  '["Yes","No"]'::jsonb,
  true
FROM public.jd_requirements r
WHERE r.jd_base_document_id = (
  SELECT id FROM public.jd_base_documents
  WHERE job_id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid
)
  AND r.tier = 'must_have'
ORDER BY r.created_at
LIMIT 5;

COMMIT;

-- Readiness check (run after COMMIT — all three counts must pass before soak)
SELECT
  j.id AS job_id,
  j.title,
  jbd.id AS jd_base_id,
  jbd.approved_at IS NOT NULL AS jd_approved,
  (SELECT count(*) FROM jd_requirements r
   WHERE r.jd_base_document_id = jbd.id AND r.tier = 'must_have') AS must_have_count,
  (SELECT count(*) FROM prescreen_questions pq
   WHERE pq.jd_base_document_id = jbd.id AND pq.gating) AS prescreen_q_count,
  (SELECT enabled FROM feature_flags WHERE key = 'ff_whatsapp_gate') AS flag_global,
  (SELECT count(*) FROM organisation_runtime_feature_flag_overrides o
   WHERE o.organisation_id = j.organisation_id
     AND o.flag_key = 'ff_whatsapp_gate' AND o.enabled) AS flag_org_on
FROM jobs j
LEFT JOIN jd_base_documents jbd ON jbd.job_id = j.id
WHERE j.id = '1efb213a-5c92-4db4-a0d9-5fa0268b25c1'::uuid;

-- Expected readiness: jd_approved = true, must_have_count = 3, prescreen_q_count = 3
