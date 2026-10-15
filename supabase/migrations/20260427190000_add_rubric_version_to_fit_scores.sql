ALTER TABLE public.fit_scores
  ADD COLUMN IF NOT EXISTS rubric_version_id text;

COMMENT ON COLUMN public.fit_scores.rubric_version_id
  IS 'Rubric version identifier captured at scoring time; populated from rubric prompt_version in Phase 1 and normalized in Phase 2.';

UPDATE public.fit_scores
SET rubric_version_id = COALESCE(rubric_version_id, rubric_snapshot ->> 'prompt_version')
WHERE rubric_version_id IS NULL
  AND rubric_snapshot IS NOT NULL;

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'scoring_phase1_wiring',
  false,
  '[DEPRECATED] Phase 1 wiring is now default-on; this flag is retained only for backward compatibility in older environments.'
)
ON CONFLICT (key) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = now();
