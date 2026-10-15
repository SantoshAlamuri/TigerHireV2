-- Clear Stage 2 evidence cache so rescoring uses new prompt (stage2-production-v1.1).
-- Stricter grading: A requires built + scope + duration/scale; conservative principle.
DELETE FROM fit_score_evidence;
