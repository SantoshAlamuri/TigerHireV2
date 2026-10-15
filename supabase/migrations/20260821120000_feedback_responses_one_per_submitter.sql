-- Audit #354 PR-4 — one interview-feedback row per (candidate, submitter).
--
-- APPLIED via MCP to BOTH DBs on 2026-08-21 (both feedback_responses tables were
-- empty — 0 rows, 0 duplicate groups — so no backfill/dedupe was needed).
--
-- The feedback route had no uniqueness, so a colleague could stack a second,
-- contradictory verdict on the same candidate. The route now revises the
-- submitter's own row on resubmit; this partial unique index is the backstop
-- against a concurrent double-submit.
create unique index if not exists feedback_responses_candidate_submitter_uq
  on public.feedback_responses (pipeline_candidate_id, submitted_by)
  where pipeline_candidate_id is not null and submitted_by is not null;
