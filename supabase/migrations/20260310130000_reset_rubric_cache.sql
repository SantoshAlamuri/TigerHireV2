-- Clear old rubrics so new template is used.
-- prompt_version lives inside role_intelligence jsonb, not as a column.
DELETE FROM fit_score_rubrics
WHERE (role_intelligence->>'prompt_version') IS DISTINCT FROM 'template-v2.0';

-- Force re-extraction with new rubric
DELETE FROM fit_score_evidence;
