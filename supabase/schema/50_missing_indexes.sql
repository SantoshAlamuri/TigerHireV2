-- P1-12: Add missing composite indexes flagged by Audit 4.
-- applications(job_id, status) for filtered job application queries.
-- messages(conversation_id, created_at) already covered by idx_messages_conversation.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_job_status
  ON applications (job_id, status);
