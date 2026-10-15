-- Migration: Add extraction_facts and stage2_version columns to fit_score_evidence
-- Purpose: Support Stage 2 hybrid approach (v2.0) that extracts facts separately from grading
-- This provides an audit trail of what facts were extracted before deterministic grading

ALTER TABLE fit_score_evidence 
ADD COLUMN IF NOT EXISTS extraction_facts jsonb,
ADD COLUMN IF NOT EXISTS stage2_version text DEFAULT 'v1.0';

COMMENT ON COLUMN fit_score_evidence.extraction_facts IS 'Stage 2 v2.0: Raw CVFacts extracted from resume before deterministic grading. Stores skills, named_tools, named_deliverables, metrics, years_per_company, etc.';
COMMENT ON COLUMN fit_score_evidence.stage2_version IS 'Stage 2 prompt version (v1.0 = original single-step, v2.0 = hybrid two-step). Used for cache invalidation and audit.';
