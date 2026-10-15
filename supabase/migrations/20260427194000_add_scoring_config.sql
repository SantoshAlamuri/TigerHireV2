CREATE TABLE IF NOT EXISTS public.scoring_config (
  key text NOT NULL,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, version)
);

CREATE INDEX IF NOT EXISTS idx_scoring_config_effective
  ON public.scoring_config (key, effective_from DESC);
