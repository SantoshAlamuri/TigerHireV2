CREATE TABLE IF NOT EXISTS public.rubric_version (
  id text PRIMARY KEY,
  rubric_id text NOT NULL,
  version integer NOT NULL,
  snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rubric_version_rubric_version
  ON public.rubric_version (rubric_id, version);

CREATE INDEX IF NOT EXISTS idx_fit_scores_rubric_version_id
  ON public.fit_scores (rubric_version_id);
