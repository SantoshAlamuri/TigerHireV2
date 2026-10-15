-- V3 Scoring Cascade Phase 2: structured JD on jd_base_documents

ALTER TABLE public.jd_base_documents
  ADD COLUMN IF NOT EXISTS structured_jd jsonb,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.jd_base_documents.structured_jd IS
  '4-tier structured JD (role_basics, responsibilities, must/need/nice). Used when ff_structured_jd is ON.';
COMMENT ON COLUMN public.jd_base_documents.version IS
  'Incremented on HM approval; invalidates rerank_cache rows for this job.';
