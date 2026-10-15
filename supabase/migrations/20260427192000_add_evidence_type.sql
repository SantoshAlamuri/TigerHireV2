CREATE TABLE IF NOT EXISTS public.evidence_type (
  id text PRIMARY KEY,
  canonical_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  base_reliability numeric(4,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_type
  ADD CONSTRAINT evidence_type_base_reliability_check
  CHECK (base_reliability >= 0 AND base_reliability <= 1);
