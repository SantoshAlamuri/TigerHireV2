/**
 * Supabase table and view names — single source of truth aligned with supabase/schema/*.sql.
 * Use these constants instead of string literals when calling supabase.from(...).
 * See supabase/TABLES_AND_VIEWS.md for full reference.
 */

/** Public tables (use with supabase.from(TABLE_NAME)) */
export const SUPABASE_TABLES = {
  organisations: "organisations",
  profiles: "profiles",
  waitlist: "waitlist",
  contact_submissions: "contact_submissions",
  signals: "signals",
  candidates: "candidates",
  jobs: "jobs",
  fit_scores: "fit_scores",
  hiring_outcomes: "hiring_outcomes",
  fitscore_extraction_log: "fitscore_extraction_log",
  jd_intel_cache: "jd_intel_cache",
  candidate_profile_cache: "candidate_profile_cache",
  invites: "invites",
  candidate_unlocks: "candidate_unlocks",
  agent_logs: "agent_logs",
  subscriptions: "subscriptions",
  applications: "applications",
  resume_versions: "resume_versions",
  verifications: "verifications",
  delivery_feedback: "delivery_feedback",
  vouches: "vouches",
  verification_claims: "verification_claims",
  referrals: "referrals",
  pipeline_stages: "pipeline_stages",
  pipeline_candidates: "pipeline_candidates",
  notifications: "notifications",
  hiring_requests: "hiring_requests",
  shortlist_approvals: "shortlist_approvals",
  employee_referrals: "employee_referrals",
  resignation_events: "resignation_events",
  consent_records: "consent_records",
  erasure_requests: "erasure_requests",
  retention_deletions: "retention_deletions",
  failed_operations: "failed_operations",
  interview_availability_slots: "interview_availability_slots",
  feedback_form_templates: "feedback_form_templates",
  feedback_responses: "feedback_responses",
  conversations: "conversations",
  conversation_participants: "conversation_participants",
  messages: "messages",
  saved_searches: "saved_searches",
  email_preferences: "email_preferences",
  agency_clients: "agency_clients",
  orchestrator_runs: "orchestrator_runs",
  orchestrator_steps: "orchestrator_steps",
  stripe_events: "stripe_events",
  idempotency_keys: "idempotency_keys",
  billing_plans: "billing_plans",
  candidate_preferences: "candidate_preferences",
  employee_invites: "employee_invites",
  rate_limit_log: "rate_limit_log",
  feature_flags: "feature_flags",
  organisation_feature_overrides: "organisation_feature_overrides",
  organisation_runtime_feature_flag_overrides: "organisation_runtime_feature_flag_overrides",
  whatsapp_sessions: "whatsapp_sessions",
  support_requests: "support_requests",
  hris_sync_runs: "hris_sync_runs",
} as const;

/** Public views (use with supabase.from(VIEW_NAME)) */
export const SUPABASE_VIEWS = {
  analytics_time_to_hire: "analytics_time_to_hire",
  analytics_pipeline_conversion: "analytics_pipeline_conversion",
  analytics_candidates_by_source: "analytics_candidates_by_source",
  analytics_recent_activity: "analytics_recent_activity",
} as const;

/** Storage bucket IDs (use with supabase.storage.from(BUCKET_ID)) */
export const SUPABASE_STORAGE_BUCKETS = {
  resumes: "resumes",
  candidateCvs: "candidate-cvs",
  verificationVideos: "verification-videos",
} as const;

export type SupabaseTableName = (typeof SUPABASE_TABLES)[keyof typeof SUPABASE_TABLES];
export type SupabaseViewName = (typeof SUPABASE_VIEWS)[keyof typeof SUPABASE_VIEWS];
export type SupabaseStorageBucketId =
  (typeof SUPABASE_STORAGE_BUCKETS)[keyof typeof SUPABASE_STORAGE_BUCKETS];
