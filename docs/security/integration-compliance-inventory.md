# Integration and Compliance Inventory

## Purpose

This inventory is the source of truth for integration capability and compliance readiness. It maps each area to implementation evidence and a maturity state:

- `Registered`: Provider/config exists
- `Connected`: Credentials or OAuth are configured
- `Operational`: Runtime path is exercised by API/jobs
- `Compliant`: Audit/RBAC/tenant controls are explicit
- `Monitored`: Health/SLA/test coverage exists

## Integration Matrix

| Category     | Capability                                          | Maturity    | Evidence                                                                                                                                               | Owner                 |
| ------------ | --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Job Boards   | Adzuna and Indeed outbound distribution             | Operational | `src/lib/distribution/engine.ts`, `src/lib/distribution/connectors/adzuna.ts`, `src/lib/distribution/connectors/indeed.ts`, `src/inngest/functions.ts` | Platform Integrations |
| Job Boards   | Org-scoped credentials and settings                 | Compliant   | `src/app/api/settings/org/integrations/route.ts`, `src/app/api/org/job-board-credentials/route.ts`                                                     | Platform Integrations |
| HRIS/Payroll | Headcount plan sync bridge and validation           | Operational | `src/app/api/headcount-plans/sync/route.ts`, `src/lib/services/headcount-plan-sync.ts`, `src/lib/hiring-requests/headcount-plan-validation.ts`         | Hiring Workflow       |
| Assessment   | First-party assessment lifecycle and share tokens   | Operational | `src/app/api/assessments/route.ts`, `src/app/api/assessment-templates/route.ts`                                                                        | Assessments           |
| Interview    | Calendar/room/transcription provider resolution     | Operational | `src/app/api/jobs/[id]/interviews/book/route.ts`, `src/lib/settings/resolve-integration.ts`                                                            | Interviewing          |
| BGV          | SpringVerify initiate + webhook intake              | Partial     | `src/app/api/integrations/springverify/initiate/route.ts`, `src/app/api/webhooks/springverify/route.ts`, `src/inngest/functions.ts`                    | Offer Ops             |
| Identity     | SSO login + org enforce SSO                         | Compliant   | `src/app/api/auth/sso/route.ts`, `src/lib/security/company-sso-enforcement.ts`                                                                         | Security              |
| Identity     | SCIM Users/Groups APIs                              | Compliant   | `src/app/api/scim/v2/Users/route.ts`, `src/app/api/scim/v2/Groups/route.ts`                                                                            | Security              |
| API/Webhooks | Public OpenAPI endpoint and webhook handlers        | Partial     | `src/app/api/openapi/route.ts`, `src/app/api/webhooks/*/route.ts`                                                                                      | Platform              |
| Compliance   | Org compliance scorecard + EEO/OFCCP readiness APIs | Operational | `src/app/api/compliance/scorecard/route.ts`, `src/app/api/compliance/eeo-ofccp-readiness/route.ts`                                                     | Security/Product Ops  |

## Compliance Matrix

| Control                     | Status          | Evidence                                                                                                                          | Notes                                                                             |
| --------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Consent capture             | Implemented     | `supabase/schema/34_consent_and_erasure.sql`, `src/lib/services/ConsentService.ts`                                                | WhatsApp and app flows present                                                    |
| Erasure request + execution | Implemented     | `src/app/api/candidates/erasure/route.ts`, `src/lib/services/CandidateService.ts`                                                 | Candidate/self-service and admin paths                                            |
| Retention settings          | Partial         | `src/app/api/settings/privacy/route.ts`, `src/app/api/cron/privacy-retention/route.ts`, `docs/security/pii-retention-coverage.md` | Runtime erasure job exists; table-level duration policy still needs formalization |
| Tenant isolation / RLS      | Implemented     | `supabase/migrations/20260417210000_hiring_manager_job_scoped_rls.sql`, `docs/security/hiring-manager-scope.md`                   | Job-scoped HM protections                                                         |
| Audit trail (hiring/offer)  | Implemented     | `src/lib/audit/hiring-offer-audit.ts`, `src/app/api/audit/hiring-offer/route.ts`                                                  | Export route exists                                                               |
| PII access audit            | Partial         | `supabase/migrations/20250307180000_access_audit_log.sql`, `src/app/api/candidates/[id]/unlock/route.ts`                          | Expand coverage to all PII reads/downloads                                        |
| SSO enforcement             | Implemented     | `supabase/migrations/20260418100000_organisations_enforce_sso.sql`, `src/lib/security/company-sso-enforcement.ts`                 | Applied on login/callback                                                         |
| EEO/OFCCP reporting         | Not implemented | `docs/PRODUCT_FEATURE_GAPS.md`                                                                                                    | Enterprise extension scope                                                        |

## Immediate Priority Gaps

1. DSAR parity: subject-access portability flow and SLA-aligned erasure messaging.
2. Full PII access auditing on resume viewing/downloading and export endpoints.
3. Connector consistency: lifecycle state and health metadata across scopes.
4. Webhook parity checks for configured providers.
5. Doc parity: keep backlog and gaps docs synchronized with actual code.

## Governance Checklist (Definition of Done per connector)

- Integration has owner and scope (`platform`, `organisation`, or `user`).
- Credentials are secret-managed and never returned in plain text.
- Runtime path has explicit audit event(s).
- Role checks and tenant boundaries are validated.
- Failure state is visible through `status`, `status_message`, and last update.
- Unit or integration tests cover connect, run, and failure paths.
