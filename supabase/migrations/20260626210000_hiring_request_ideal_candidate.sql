-- Capture the ideal-candidate profile on a hiring request as structured, editable fields
-- (previously only folded into the free-text description). These flow into the generated JD
-- — and therefore the fit-scoring ICP — when the request is converted to a job.
ALTER TABLE public.hiring_requests
  ADD COLUMN IF NOT EXISTS must_haves text,
  ADD COLUMN IF NOT EXISTS nice_to_haves text,
  ADD COLUMN IF NOT EXISTS ideal_experience text,
  ADD COLUMN IF NOT EXISTS ideal_summary text;

COMMENT ON COLUMN public.hiring_requests.must_haves IS
  'Ideal-candidate non-negotiables, as entered on the hiring request. Seeds the JD + scoring ICP on convert.';
COMMENT ON COLUMN public.hiring_requests.nice_to_haves IS
  'Ideal-candidate bonus signals. Seeds the JD + scoring ICP on convert.';
COMMENT ON COLUMN public.hiring_requests.ideal_experience IS
  'Target experience range (free text, e.g. "5–8 years").';
COMMENT ON COLUMN public.hiring_requests.ideal_summary IS
  'Short description of what a great hire looks like. Seeds the JD + scoring ICP on convert.';
