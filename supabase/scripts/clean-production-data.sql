-- Production data cleanup: remove all business/test data while keeping users.
-- Keeps: auth.users (Supabase), profiles.
-- Clears: organisations, jobs, candidates, applications, pipeline, agency clients, etc.
--
-- Run this in Supabase SQL Editor or via psql against your production DB
-- after backing up. Profiles.organisation_id will be set to NULL automatically
-- (ON DELETE SET NULL) when organisations are deleted.
--
-- Usage: Run in a single transaction. Recommended: run during a maintenance window.

BEGIN;

-- 1. Feedback and pipeline (deepest children first)
DELETE FROM feedback_responses;
DELETE FROM shortlist_approvals;
DELETE FROM interview_availability_slots;
DELETE FROM pipeline_candidates;
DELETE FROM pipeline_stages;

-- 2. Orchestrator
DELETE FROM orchestrator_steps;
DELETE FROM orchestrator_runs;

-- 3. Applications and scoring
DELETE FROM applications;
DELETE FROM fit_scores;
DELETE FROM delivery_feedback;

-- 4. Unlocks and candidate-linked data
DELETE FROM candidate_unlocks;
DELETE FROM resume_versions;
DELETE FROM verification_claims;
DELETE FROM verifications;
DELETE FROM vouches;
DELETE FROM consent_records;
DELETE FROM erasure_requests;
DELETE FROM retention_deletions;
DELETE FROM referrals;

-- 5. Employee referrals and resignations
DELETE FROM employee_referrals;
DELETE FROM resignation_events;

-- 6. Messaging
DELETE FROM messages;
DELETE FROM conversation_participants;
DELETE FROM conversations;

-- 7. Hiring and invites
DELETE FROM hiring_requests;
DELETE FROM invites;

-- 8. Billing and agency
DELETE FROM subscriptions;
DELETE FROM agency_clients;
DELETE FROM feedback_form_templates;

-- 9. Jobs and candidates
DELETE FROM jobs;
DELETE FROM signals;
DELETE FROM candidates;

-- 10. Organisations (profiles.organisation_id will become NULL via ON DELETE SET NULL)
DELETE FROM organisations;

-- Optional: clear operational/log tables for a fully clean slate (uncomment if desired)
-- DELETE FROM notifications;
-- DELETE FROM rate_limit_log;
-- DELETE FROM idempotency_keys;
-- DELETE FROM agent_logs;
-- DELETE FROM waitlist;
-- DELETE FROM contact_submissions;
-- DELETE FROM saved_searches;   -- user preferences; keep if you want to preserve them
-- DELETE FROM email_preferences; -- user preferences; keep if you want to preserve them

COMMIT;

-- After running:
-- 1. All profile rows will have organisation_id = NULL; users can re-join or create orgs.
-- 2. Storage buckets (resumes, candidate-cvs, verification-videos) may still contain files.
--    Clean them in Supabase Dashboard > Storage if you need empty buckets.
-- 3. Do not run seed-demo-users or seed/finstack in production.
