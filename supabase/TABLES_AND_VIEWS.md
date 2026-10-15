# Supabase tables and views

Single reference for all public tables and views. Use these names in app code and keep in sync with `supabase/schema/*.sql`.

## Tables (public)

| Table                          | Schema file                                         | Description                                                                  |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `organisations`                | 01_organisations.sql                                | Companies and agencies; billing, stripe_customer_id                          |
| `profiles`                     | 02_profiles.sql                                     | User profiles (role, organisation_id); id → auth.users                       |
| `waitlist`                     | 03_waitlist_and_contact.sql                         | Waitlist signups                                                             |
| `contact_submissions`          | 03_waitlist_and_contact.sql                         | Contact form submissions                                                     |
| `signals`                      | 04_signals.sql                                      | Raw candidate signals (Talent Scout)                                         |
| `candidates`                   | 05_candidates.sql, 15_candidates_prd.sql, etc.      | Enriched candidates; user_id when claimed; profile_embedding, signal_sources |
| `jobs`                         | 06_jobs.sql, 06a, 06b, 52                           | Job descriptions; jd_embedding; hiring_manager_id, assigned_recruiter_id     |
| `fit_scores`                   | 07_fit_scores.sql, 07a, 07b                         | Per job–candidate FitScore; dimensions, red_flags, interview_angles          |
| `invites`                      | 08_invites_unlocks_agent_logs.sql                   | Org invites                                                                  |
| `candidate_unlocks`            | 08_invites_unlocks_agent_logs.sql                   | Unlocks for candidate access                                                 |
| `agent_logs`                   | 08_invites_unlocks_agent_logs.sql                   | Agent activity logs                                                          |
| `subscriptions`                | 09_subscriptions.sql                                | Stripe company/candidate plans                                               |
| `applications`                 | 11_applications.sql                                 | Candidate applications to jobs; status, fit_score_id                         |
| `resume_versions`              | 42_resume_versions.sql                              | Multiple resume versions per candidate; storage_path for signed URLs         |
| `verifications`                | 13_verifications.sql                                | VerifyKit verification flow                                                  |
| `delivery_feedback`            | 14_delivery_feedback.sql                            | Hire/reject feedback for FitScore                                            |
| `vouches`                      | 17_vouches.sql                                      | Vouches for candidates                                                       |
| `verification_claims`          | 18_verification_claims.sql                          | Verification claims                                                          |
| `referrals`                    | 19_referrals.sql                                    | Referrals (referrer_id → auth.users)                                         |
| `pipeline_stages`              | 20_pipeline.sql                                     | Pipeline stage definitions                                                   |
| `pipeline_candidates`          | 20_pipeline.sql                                     | Candidate in pipeline per job                                                |
| `notifications`                | 24_notifications.sql                                | User notifications                                                           |
| `hiring_requests`              | 25_hiring_requests.sql                              | Hiring requests (created_by, reviewed_by)                                    |
| `shortlist_approvals`          | 26_shortlist_approvals.sql                          | Shortlist approvals (approver_id)                                            |
| `employee_referrals`           | 31_employee_referrals.sql                           | Employee referral records                                                    |
| `resignation_events`           | 31_employee_referrals.sql                           | Resignation events                                                           |
| `consent_records`              | 34_consent_and_erasure.sql                          | Consent records                                                              |
| `erasure_requests`             | 34_consent_and_erasure.sql                          | Erasure requests                                                             |
| `retention_deletions`          | 34_consent_and_erasure.sql                          | Retention deletion log                                                       |
| `failed_operations`            | 39_failed_operations_dlq.sql                        | DLQ for failed operations                                                    |
| `interview_availability_slots` | 40_interview_scheduling.sql                         | Interview slots (user_id)                                                    |
| `feedback_form_templates`      | 41_interview_feedback.sql                           | Feedback form templates                                                      |
| `feedback_responses`           | 41_interview_feedback.sql                           | Feedback responses                                                           |
| `conversations`                | 44_messages.sql                                     | Conversations                                                                |
| `conversation_participants`    | 44_messages.sql                                     | Conversation participants                                                    |
| `messages`                     | 44_messages.sql                                     | Messages                                                                     |
| `saved_searches`               | 47_saved_searches.sql                               | Saved searches (user_id)                                                     |
| `email_preferences`            | 48_email_preferences.sql                            | Email preferences (user_id)                                                  |
| `agency_clients`               | 72_agency_clients.sql, 73                           | Agency ↔ client org links                                                   |
| `orchestrator_runs`            | 53_orchestrator.sql                                 | Orchestrator runs (started_by)                                               |
| `orchestrator_steps`           | 53_orchestrator.sql                                 | Orchestrator steps                                                           |
| `stripe_events`                | 38_stripe_events_and_rpc.sql                        | Processed Stripe event IDs (idempotency)                                     |
| `idempotency_keys`             | migrations/20250225160000_idempotency_keys.sql      | Idempotency keys                                                             |
| `billing_plans`                | migrations/20250225150000_billing_plans.sql         | Billing plans                                                                |
| `candidate_preferences`        | migrations/20250225170000_candidate_preferences.sql | Candidate preferences (user_id)                                              |
| `employee_invites`             | 30_employee_status_columns.sql                      | Employee invites                                                             |
| `rate_limit_log`               | 36_rate_limit_and_flags.sql                         | Rate limit log                                                               |
| `feature_flags`                | 36_rate_limit_and_flags.sql                         | Feature flags                                                                |
| `whatsapp_sessions`            | 16_whatsapp_sessions.sql                            | WhatsApp sessions                                                            |

## Views (public)

| View                             | Schema file            | Description                                     |
| -------------------------------- | ---------------------- | ----------------------------------------------- |
| `analytics_time_to_hire`         | 46_analytics_views.sql | Time-to-hire by job (days to hired)             |
| `analytics_pipeline_conversion`  | 46_analytics_views.sql | Pipeline conversion funnel per job              |
| `analytics_candidates_by_source` | 46_analytics_views.sql | Candidate count by signal_sources per org       |
| `analytics_recent_activity`      | 46_analytics_views.sql | Last 30 days activity (applications + pipeline) |

## Storage buckets

| Bucket                | Schema / migration                                  | Description                                         |
| --------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `resumes`             | 12_storage.sql, 74_tenant_security_storage_apps.sql | Candidate resumes; path `{candidate_id}/{id}.{ext}` |
| `candidate-cvs`       | 21_storage_candidate_cvs.sql                        | CVs from WhatsApp (Scout)                           |
| `verification-videos` | 12_storage.sql (if present)                         | Verification videos                                 |

## Enums (public)

Defined in `00_extensions_and_enums.sql` and other schema files:

- `app_role` — super_admin, company_admin, recruiter, hiring_manager, agency, employee, candidate_pro, candidate_free
- `organisation_type` — company, agency
- `organisation_approval` — pending, approved, rejected
- `job_status` — draft, open, closed
- `signal_source` — naukri, indeed, linkedin, manual, other
- `signal_status` — raw, enriched, verified, rejected
- `company_plan` / `candidate_plan` — Stripe plan names
- `verification_badge` — bronze, silver, gold
- `application_status` — applied, viewed, shortlisted, rejected, hired, withdrawn (11_applications.sql)
- `interest_level` — interested, strong_interest (11_applications.sql)

## RPC / functions (examples)

- `match_candidates(query_embedding, match_threshold, match_count, intent_min)` — semantic candidate search
- `match_jobs(query_embedding, match_threshold, match_count)` — semantic job search
- `auth_organisation_id()` / `auth_role()` — RLS helpers (10_rls_policies, 74)
- `get_accessible_candidate_ids(org_ids uuid[])` — tenant-scoped candidate access (74)
- `stripe_event_try_acquire(event_id)`, `stripe_checkout_company(...)`, `stripe_checkout_candidate(...)` — Stripe (38)
- `switch_default_resume(p_candidate_id, p_version_id)` — atomic default resume switch (migrations)

## Sync with app

- Use table/view names from this doc or from `src/types/supabase-tables.ts` (table name constants).
- Run schema files in order (see `supabase/schema/README.md`). Migrations in `supabase/migrations/` may add columns or tables not repeated in numbered schema files.
