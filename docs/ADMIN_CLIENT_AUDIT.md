# Admin Client (createSupabaseAdmin) Audit

The service-role client bypasses Row-Level Security. Each usage is justified below. Prefer the scoped server client wherever RLS is sufficient.

| File                                                        | Justification                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/whatsapp/*`                                        | WhatsApp webhooks and session management; no user JWT.                               |
| `src/app/api/jobs/[id]/pipeline/request-interview/route.ts` | Pipeline updates that span org/candidate; RLS allows but admin used for consistency. |
| `src/app/api/candidates/matches/route.ts`                   | Match candidates across jobs; needs cross-org visibility for agency.                 |
| `src/lib/utils/dlq.ts`                                      | Dead-letter / system logging; not user-scoped.                                       |
| `src/app/api/agency/backfill-pipeline/route.ts`             | Agency backfill across client orgs; admin required.                                  |
| `src/app/api/auth/seed-demo-users/route.ts`                 | Seeding; no user context.                                                            |
| `src/lib/whatsapp/application-bridge.ts`                    | Bridge between WhatsApp and applications; system operation.                          |
| `src/lib/agents/talent-scout.ts`                            | Agent runs without user JWT; processes signals.                                      |
| `src/app/(public)/apply/[slug]/layout.tsx`                  | Public apply layout; fetches org/job by slug before auth.                            |
| `src/app/api/candidates/erasure/route.ts`                   | GDPR erasure; must delete across tables regardless of RLS.                           |
| `src/app/api/jobs/[id]/pipeline/candidates/[pcId]/route.ts` | Pipeline candidate updates; admin for cross-org agency.                              |
| `src/app/api/agency/reprocess-candidates/route.ts`          | Agency reprocess; multi-tenant.                                                      |
| `src/lib/agents/orchestrator.ts`                            | Background orchestrator; no user session.                                            |
| `src/app/api/invites/[token]/route.ts`                      | Invite accept; creates profile/org link before user is in org.                       |
| `src/app/api/jobs/[id]/pipeline/approve/route.ts`           | Approval flow; admin for pipeline state.                                             |
| `src/app/api/contact/route.ts`                              | Public contact form; no auth.                                                        |
| `src/app/api/seed/finstack/route.ts`                        | Seed script; dev only (excluded from prod build).                                    |
| `src/app/api/cron/*`                                        | Cron routes; no user JWT; use admin for batch jobs.                                  |
| `src/lib/agents/hiring-signal.ts`                           | Signal processing; system agent.                                                     |
| `src/app/api/fit-score/route.ts`                            | FitScore upsert; RLS may block INSERT on fit_scores; admin ensures write.            |
| `src/lib/agents/verify.ts`                                  | Verification agent; no user context.                                                 |
| `src/app/api/cron/job-alerts/route.ts`                      | Cron; admin for saved_searches + emails.                                             |
| `src/app/api/webhooks/stripe/route.ts`                      | Webhook; no user JWT; updates billing.                                               |
| `src/app/api/signals/ingest/route.ts`                       | Ingest can be cron or super_admin; admin for inserts.                                |
| `src/lib/agents/scout.ts`                                   | Scout agent; system.                                                                 |
| `src/app/api/debug/*`                                       | Debug routes; dev only (excluded from prod build).                                   |
| `src/lib/whatsapp/referral-handler.ts`                      | Referral handling; WhatsApp context.                                                 |
| `src/lib/agents/public-apply.ts`                            | Public apply; no auth until after submit.                                            |
| `src/lib/agents/trust-score.ts`                             | Trust score recalculation; cron/agent.                                               |
| `src/app/api/waitlist/route.ts`                             | Public waitlist; no auth.                                                            |
| `src/app/api/auth/register/route.ts`                        | Registration; creates user + profile; admin for profile insert.                      |
| `src/app/api/apply/[slug]/route.ts`                         | Public apply; admin for application insert.                                          |
| `src/app/api/candidates/upload-resume/route.ts`             | Resume upload; admin for storage and candidate update.                               |
| `src/app/api/approvals/route.ts`                            | Approvals; admin for pipeline/org visibility.                                        |
| `src/lib/services/stripe.ts`                                | Billing; idempotency and plan checks.                                                |
| `src/lib/services/resend.ts`                                | Email; fetches org/user for templates.                                               |
| `src/app/api/apply/route.ts`                                | Apply; admin for application.                                                        |
| `src/app/api/admin/*`                                       | Admin dashboard; super_admin only; admin for cross-org.                              |
| `src/app/api/my-pipeline/route.ts`                          | Pipeline list; admin for agency client resolution.                                   |
| `src/lib/agents/scheduler.ts`                               | Scheduler agent; no user.                                                            |
| `src/app/api/agency/rescore-candidates/route.ts`            | Agency rescore; multi-tenant.                                                        |
| `src/lib/agents/fitscore-agent.ts`                          | FitScore batch agent; cron/background.                                               |
| `src/app/api/applications/[id]/route.ts`                    | Application details; admin for pipeline/org.                                         |
| `src/app/api/contact/route.ts`                              | Public contact.                                                                      |
| `src/lib/feature-flags.ts`                                  | Feature flags; no user; read-only.                                                   |
| `src/app/api/agency/clients/route.ts`                       | Agency clients; admin for org links.                                                 |
| `src/app/api/auth/callback/route.ts`                        | OAuth callback; profile/org setup.                                                   |
| `src/app/api/auth/ensure-profile/route.ts`                  | Ensure profile exists; post-login.                                                   |
| `src/lib/security/tenancy.ts`                               | Resolve org/agency; admin for auth_organisation_ids.                                 |
| `src/lib/security/rate-limit.ts`                            | Rate limit state; global.                                                            |
| `src/lib/security/idempotency.ts`                           | Idempotency keys; global.                                                            |
| `src/lib/supabase/transaction.ts`                           | Multi-table transactions; admin for atomicity.                                       |
| `src/app/api/candidates/[id]/unlock/route.ts`               | Audit log insert (access_audit_log); service role required.                          |
| `src/app/api/cron/score-batch/route.ts`                     | cron_runs table insert/update; service role.                                         |
| `src/app/api/health/route.ts`                               | Health check; DB connectivity.                                                       |

Last updated: 2026-03-07. When adding a new admin client usage, add a row here and prefer server client when RLS is sufficient.
