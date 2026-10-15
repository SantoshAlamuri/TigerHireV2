-- idibu job board integration: candidate metadata + dead letter queue

BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_detail text;

CREATE INDEX IF NOT EXISTS idx_candidates_external_id
  ON public.candidates (external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS apply_method text DEFAULT 'manual';

COMMENT ON COLUMN public.candidates.external_id IS 'External board/aggregator candidate id (e.g. idibu payload.id).';
COMMENT ON COLUMN public.candidates.source_detail IS 'Fine-grained inbound source (e.g. Indeed board name from idibu).';
COMMENT ON COLUMN public.applications.apply_method IS 'How the application arrived: manual, job_board, apply_page, referral, etc.';

CREATE TABLE IF NOT EXISTS public.idibu_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_json jsonb NOT NULL,
  error_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idibu_dead_letter_created_at
  ON public.idibu_dead_letter (created_at DESC);

COMMENT ON TABLE public.idibu_dead_letter IS 'Unprocessable idibu webhook payloads (e.g. unknown vacancy reference).';

ALTER TABLE public.idibu_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read idibu dead letter"
  ON public.idibu_dead_letter FOR SELECT
  USING (public.auth_role() = 'super_admin');

COMMIT;
