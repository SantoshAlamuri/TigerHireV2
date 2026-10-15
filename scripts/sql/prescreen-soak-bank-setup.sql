-- Prescreen gate soak: bank-end setup (idempotent)
-- Run in Supabase SQL editor (prod/staging) with service role.
-- Does NOT flip ff_whatsapp_gate — do that only after base apply flow is verified.
--
-- Target job: Demo JD for Hiring Manager (Finstack, open)
--   job_id:  f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6
--   org_id:  69005af4-82ad-436c-8798-5a271c03554e
--
-- After this script: approved JD Base + 3 must-haves + 3 prescreen questions.

BEGIN;

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
  'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid,
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
  '78e5b7cb-980e-485d-b452-31640a62cac8'::uuid,
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

DELETE FROM public.jd_requirements r
WHERE r.jd_base_document_id = (
  SELECT id FROM public.jd_base_documents WHERE job_id = 'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid
);

INSERT INTO public.jd_requirements (jd_base_document_id, tier, kind, verifiable, text, weight)
SELECT jbd.id, 'must_have', 'other', true, v.text, NULL
FROM public.jd_base_documents jbd
CROSS JOIN (VALUES
  ('3+ years experience in a relevant professional role'),
  ('Eligible to work in India without visa sponsorship'),
  ('Available to start within 60 days')
) AS v(text)
WHERE jbd.job_id = 'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid;

DELETE FROM public.prescreen_questions pq
WHERE pq.jd_base_document_id = (
  SELECT id FROM public.jd_base_documents WHERE job_id = 'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid
);

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
  SELECT id FROM public.jd_base_documents WHERE job_id = 'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid
)
  AND r.tier = 'must_have'
ORDER BY r.created_at
LIMIT 5;

COMMIT;

-- Readiness check (run after COMMIT)
SELECT
  j.id AS job_id,
  j.title,
  jbd.id AS jd_base_id,
  jbd.approved_at IS NOT NULL AS jd_approved,
  (SELECT count(*) FROM jd_requirements r WHERE r.jd_base_document_id = jbd.id AND r.tier = 'must_have') AS must_have_count,
  (SELECT count(*) FROM prescreen_questions pq WHERE pq.jd_base_document_id = jbd.id AND pq.gating) AS prescreen_q_count,
  (SELECT enabled FROM feature_flags WHERE key = 'ff_whatsapp_gate') AS flag_global,
  (SELECT count(*) FROM organisation_runtime_feature_flag_overrides o
   WHERE o.organisation_id = j.organisation_id AND o.flag_key = 'ff_whatsapp_gate' AND o.enabled) AS flag_org_on
FROM jobs j
LEFT JOIN jd_base_documents jbd ON jbd.job_id = j.id
WHERE j.id = 'f25a04b0-23e1-45d4-8eec-5ee20a5f5ca6'::uuid;

-- Step 4 (human, after one clean application with gate OFF):
-- INSERT INTO organisation_runtime_feature_flag_overrides (organisation_id, flag_key, enabled, reason)
-- VALUES ('69005af4-82ad-436c-8798-5a271c03554e', 'ff_whatsapp_gate', true, 'prescreen soak — Demo JD')
-- ON CONFLICT (organisation_id, flag_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
