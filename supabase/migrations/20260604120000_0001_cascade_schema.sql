-- V3 Scoring Cascade Phase 0: schema + feature flags (no runtime behavior change)

-- ---------------------------------------------------------------------------
-- fit_scores observability (Phase 5 model router)
-- ---------------------------------------------------------------------------
ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS scoring_tier text,
  ADD COLUMN IF NOT EXISTS model_used text;

COMMENT ON COLUMN public.fit_scores.scoring_tier IS
  'CTC/stakes routing tier (e.g. cheap, standard, premium). Set when ff_ctc_tiering is enabled.';
COMMENT ON COLUMN public.fit_scores.model_used IS
  'Primary extraction/parse model id used for this score row (observability).';

-- ---------------------------------------------------------------------------
-- jd_requirements (4-tier structured JD; FK to jd_base_documents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jd_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_base_document_id uuid NOT NULL REFERENCES public.jd_base_documents (id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('must_have', 'need_to_have', 'nice_to_have')),
  kind text NOT NULL DEFAULT 'other' CHECK (
    kind IN ('work_auth', 'location', 'license', 'notice', 'onsite', 'skill', 'experience', 'other')
  ),
  verifiable boolean NOT NULL DEFAULT false,
  skill_id text,
  weight numeric,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jd_requirements_jd_base
  ON public.jd_requirements (jd_base_document_id);

CREATE INDEX IF NOT EXISTS idx_jd_requirements_tier
  ON public.jd_requirements (jd_base_document_id, tier);

COMMENT ON TABLE public.jd_requirements IS
  'Structured JD requirements per approved JD Base (must / need / nice tiers).';

-- ---------------------------------------------------------------------------
-- prescreen_questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescreen_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_base_document_id uuid NOT NULL REFERENCES public.jd_base_documents (id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.jd_requirements (id) ON DELETE SET NULL,
  question_text text NOT NULL,
  answer_type text NOT NULL DEFAULT 'yes_no' CHECK (answer_type IN ('yes_no', 'range', 'single_select')),
  options jsonb,
  gating boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescreen_questions_jd_base
  ON public.prescreen_questions (jd_base_document_id);

COMMENT ON TABLE public.prescreen_questions IS
  'WhatsApp / prescreen gating questions derived from verifiable must-haves.';

-- ---------------------------------------------------------------------------
-- prescreen_responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prescreen_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.prescreen_questions (id) ON DELETE CASCADE,
  answer text NOT NULL,
  passed boolean NOT NULL,
  gate_status text NOT NULL DEFAULT 'pending' CHECK (gate_status IN ('pending', 'passed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescreen_responses_candidate_job_question_unique
    UNIQUE (candidate_id, job_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_prescreen_responses_job_candidate
  ON public.prescreen_responses (job_id, candidate_id);

COMMENT ON TABLE public.prescreen_responses IS
  'Candidate answers to prescreen questions; gate_status aggregates to scoring eligibility.';

-- ---------------------------------------------------------------------------
-- rerank_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rerank_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  jd_base_version integer NOT NULL,
  top_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rerank_cache_job_version_unique UNIQUE (job_id, jd_base_version)
);

CREATE INDEX IF NOT EXISTS idx_rerank_cache_job
  ON public.rerank_cache (job_id, computed_at DESC);

COMMENT ON TABLE public.rerank_cache IS
  'Cached listwise rerank ordering for (job, jd_base version).';

-- ---------------------------------------------------------------------------
-- RLS (read via org-scoped jobs; writes via service role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.jd_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescreen_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescreen_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rerank_cache ENABLE ROW LEVEL SECURITY;

-- Policies are dropped-if-exists first so this migration is safe to re-run
-- (idempotent) regardless of migration-ledger version drift across environments.
DROP POLICY IF EXISTS "Org members can read jd_requirements for their jobs" ON public.jd_requirements;
CREATE POLICY "Org members can read jd_requirements for their jobs"
  ON public.jd_requirements FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jd_base_documents jbd
      JOIN public.jobs j ON j.id = jbd.job_id
      WHERE jbd.id = jd_requirements.jd_base_document_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Super admins can read all jd_requirements" ON public.jd_requirements;
CREATE POLICY "Super admins can read all jd_requirements"
  ON public.jd_requirements FOR SELECT
  USING (public.auth_role() = 'super_admin');

DROP POLICY IF EXISTS "Org members can read prescreen_questions for their jobs" ON public.prescreen_questions;
CREATE POLICY "Org members can read prescreen_questions for their jobs"
  ON public.prescreen_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jd_base_documents jbd
      JOIN public.jobs j ON j.id = jbd.job_id
      WHERE jbd.id = prescreen_questions.jd_base_document_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Super admins can read all prescreen_questions" ON public.prescreen_questions;
CREATE POLICY "Super admins can read all prescreen_questions"
  ON public.prescreen_questions FOR SELECT
  USING (public.auth_role() = 'super_admin');

DROP POLICY IF EXISTS "Org members can read prescreen_responses for their jobs" ON public.prescreen_responses;
CREATE POLICY "Org members can read prescreen_responses for their jobs"
  ON public.prescreen_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = prescreen_responses.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Super admins can read all prescreen_responses" ON public.prescreen_responses;
CREATE POLICY "Super admins can read all prescreen_responses"
  ON public.prescreen_responses FOR SELECT
  USING (public.auth_role() = 'super_admin');

DROP POLICY IF EXISTS "Org members can read rerank_cache for their jobs" ON public.rerank_cache;
CREATE POLICY "Org members can read rerank_cache for their jobs"
  ON public.rerank_cache FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = rerank_cache.job_id
        AND j.organisation_id = ANY (public.auth_organisation_ids())
    )
  );

DROP POLICY IF EXISTS "Super admins can read all rerank_cache" ON public.rerank_cache;
CREATE POLICY "Super admins can read all rerank_cache"
  ON public.rerank_cache FOR SELECT
  USING (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Feature flags (default OFF)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  (
    'ff_path_unification',
    false,
    'V3 cascade: route all scoring through merged extraction-and-verdict path'
  ),
  (
    'ff_haiku_extraction',
    false,
    'V3 cascade: use Haiku for CV parse + hybrid extraction (Sonnet for verdict/JD/vision)'
  ),
  (
    'ff_structured_jd',
    false,
    'V3 cascade: structured 4-tier JD Base + jd_requirements'
  ),
  (
    'ff_whatsapp_gate',
    false,
    'V3 cascade: WhatsApp prescreen gating before LLM scoring'
  ),
  (
    'ff_cascade_rerank',
    false,
    'V3 cascade: listwise rerank on top candidates (trigger-gated)'
  ),
  (
    'ff_ctc_tiering',
    false,
    'V3 cascade: CTC/stakes-based model tier routing'
  )
ON CONFLICT (key) DO NOTHING;
