# TigerHire Test Coverage Plan — Every Action

This document lists **every API route and action** in the app and the test cases that cover them (unit, functional, e2e).

**Execution backlog:** For phased “cover the whole product” work (waves, how to diff routes vs tests), see [`TEST_COVERAGE_BACKLOG.md`](./TEST_COVERAGE_BACKLOG.md). This table is updated as tests land; ~300 API routes exist under `src/app/api/` — many specialized routes are covered by focused files not listed on every row.

## Test types

| Type           | Location                     | Purpose                                        |
| -------------- | ---------------------------- | ---------------------------------------------- |
| **Unit**       | `tests/unit/*.test.ts`       | Route handlers: auth, validation, status codes |
| **Functional** | `tests/functional/*.test.ts` | Multi-step flows, lifecycle                    |
| **E2E**        | `e2e/*.spec.ts`              | Full browser flows (Playwright)                |

## API routes and test cases

### Health & public

| Route         | Method | Test file                                              | Cases                                          |
| ------------- | ------ | ------------------------------------------------------ | ---------------------------------------------- |
| `/api/health` | GET    | `health-route.test.ts`, `health-comprehensive.test.ts` | 200 ok, readiness 503 when DB down, JSON shape |

### Auth

| Route                          | Method    | Test file                            | Cases                                       |
| ------------------------------ | --------- | ------------------------------------ | ------------------------------------------- |
| `/api/auth/login`              | POST      | `auth-login-route.test.ts`           | 401, 400 invalid body, 200 with valid creds |
| `/api/auth/register`           | POST      | `auth-register-route.test.ts`        | 400 validation, 200 success                 |
| `/api/auth/logout`             | POST      | `auth-logout-route.test.ts`          | 200 after signOut                           |
| `/api/auth/sso`                | POST      | `auth-sso-route.test.ts`             | 400, 302 redirect                           |
| `/api/auth/link`               | GET, POST | `auth-sso-route.test.ts`             | 401, 400, 200 link                          |
| `/api/auth/forgot-password`    | POST      | `auth-forgot-password-route.test.ts` | 400, 429 rate limit, 200                    |
| `/api/auth/callback`           | GET       | `auth-callback-route.test.ts`        | redirect / error handling                   |
| `/api/auth/callback/[...rest]` | GET       | `auth-callback-route.test.ts`        | OAuth callback                              |
| `/api/auth/ensure-profile`     | POST      | `auth-ensure-profile-route.test.ts`  | 401, 200                                    |
| `/api/auth/test-login`         | POST      | —                                    | Dev-only; optional                          |
| `/api/auth/log-auth-error`     | POST      | `auth-log-auth-error-route.test.ts`  | 400, 204                                    |
| `/api/auth/seed-demo-users`    | POST      | —                                    | Dev-only; optional                          |
| `/api/auth/google`             | GET       | `auth-google-route.test.ts`          | redirect path, state, and OAuth params      |

### Jobs

| Route                                       | Method             | Test file                                                   | Cases                               |
| ------------------------------------------- | ------------------ | ----------------------------------------------------------- | ----------------------------------- |
| `/api/jobs`                                 | GET, POST          | `jobs-route.test.ts`                                        | 401, 403 candidate, 200 list/create |
| `/api/jobs/[id]`                            | GET, PATCH, DELETE | `job-id-route.test.ts`                                      | 401, 403, 404, 200 by role          |
| `/api/jobs/[id]/public`                     | GET                | `jobs-public-route.test.ts`                                 | 404, 200                            |
| `/api/jobs/[id]/availability`               | GET                | `interview-scheduling.test.ts`                              | 401, 404, 200 slots                 |
| `/api/jobs/[id]/interviews/book`            | POST               | `interviews-routes.test.ts`, `interview-scheduling.test.ts` | 401, 400, 200                       |
| `/api/jobs/[id]/interviews/cancel`          | POST               | `interview-scheduling.test.ts`                              | 401, 200                            |
| `/api/jobs/[id]/interviews/reschedule`      | POST               | `interview-scheduling.test.ts`                              | 401, 200                            |
| `/api/jobs/[id]/interviews/ics`             | GET                | `jobs-interviews-ics-route.test.ts`                         | 401, 200 ics                        |
| `/api/jobs/[id]/feedback`                   | GET, POST          | `feedback-routes.test.ts`                                   | 401, 200                            |
| `/api/jobs/[id]/feedback-templates`         | GET, POST          | `feedback-routes.test.ts`                                   | 401, 200                            |
| `/api/jobs/[id]/pipeline-stages`            | GET, POST          | `pipeline-stages-route.test.ts`                             | 401, 403, 200 list/create           |
| `/api/jobs/[id]/pipeline/candidates/[pcId]` | PATCH, DELETE      | `jobs-pipeline-candidate-pcId-route.test.ts`                | 401, 403, 200                       |
| `/api/jobs/[id]/pipeline/request-interview` | POST               | `jobs-pipeline-request-interview-route.test.ts`             | 401, 200                            |
| `/api/jobs/[id]/pipeline/approve`           | GET, POST          | `jobs-pipeline-approve-route.test.ts`                       | 401, 403, 200                       |
| `/api/jobs/[id]/orchestrator`               | GET, POST          | `jobs-orchestrator-route.test.ts`                           | 401, 200                            |
| `/api/jobs/[id]/orchestrator/approve`       | POST               | `jobs-orchestrator-approve-route.test.ts`                   | 401, 200                            |
| `/api/jobs/[id]/shortlist`                  | GET                | `jobs-shortlist-route.test.ts`                              | 401, 403, 404, 200                  |
| `/api/jobs/upload-jd`                       | POST               | `jobs-upload-jd-route.test.ts`                              | 401, 400, 200                       |
| `/api/jobs/parse-jd-url`                    | POST               | `jobs-parse-jd-url-route.test.ts`                           | 401, 200                            |
| `/api/jobs/generate-jd`                     | POST               | `jobs-generate-jd-route.test.ts`                            | 401, 200                            |

### Applications

| Route                    | Method     | Test file                                                        | Cases                                          |
| ------------------------ | ---------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `/api/applications`      | GET, POST  | `applications-route.test.ts`, `applications-list-route.test.ts`  | 401, 200 list, 200 create                      |
| `/api/applications/[id]` | GET, PATCH | `applications-withdraw.test.ts`, `applications-id-route.test.ts` | 401, 404, 200 get; withdraw + recruiter status |

### Candidates

| Route                                                 | Method        | Test file                                | Cases              |
| ----------------------------------------------------- | ------------- | ---------------------------------------- | ------------------ |
| `/api/candidates`                                     | GET           | `candidates-route.test.ts`               | 401, 200           |
| `/api/candidates/[id]`                                | GET, PATCH    | `candidates-id-route.test.ts`            | 401, 403, 404, 200 |
| `/api/candidates/matches`                             | GET           | `candidates-matches-route.test.ts`       | 401, 200           |
| `/api/candidates/erasure`                             | POST          | `candidates-erasure-route.test.ts`       | 401, 200           |
| `/api/candidates/[id]/unlock`                         | POST          | `candidates-unlock-route.test.ts`        | 401, 200           |
| `/api/candidates/upload-resume`                       | POST          | `candidates-upload-resume-route.test.ts` | 401, 400, 200      |
| `/api/candidates/[id]/resumes`                        | GET, POST     | `resume-versions-route.test.ts`          | 401, 200           |
| `/api/candidates/[id]/resumes/[versionId]`            | PATCH, DELETE | `resume-versions-route.test.ts`          | 401, 200           |
| `/api/candidates/[id]/resumes/[versionId]/signed-url` | GET           | `resume-signed-url-route.test.ts`        | 401, 200           |
| `/api/candidates/me/preferences`                      | GET, PATCH    | `candidates-preferences-route.test.ts`   | 401, 200           |

### Fit score

| Route                 | Method | Test file                 | Cases    |
| --------------------- | ------ | ------------------------- | -------- |
| `/api/fit-score`      | POST   | `fitscore-routes.test.ts` | 401, 200 |
| `/api/fit-score/[id]` | GET    | `fitscore-routes.test.ts` | 401, 200 |

### Hiring requests

| Route                       | Method     | Test file                          | Cases              |
| --------------------------- | ---------- | ---------------------------------- | ------------------ |
| `/api/hiring-requests`      | GET, POST  | `hiring-requests-route.test.ts`    | 401, 200           |
| `/api/hiring-requests/[id]` | GET, PATCH | `hiring-requests-id-route.test.ts` | 401, 403, 404, 200 |

### Approvals

| Route            | Method | Test file                 | Cases                        |
| ---------------- | ------ | ------------------------- | ---------------------------- |
| `/api/approvals` | GET    | `approvals-route.test.ts` | 401, 403 candidate, 200 list |

### Pipeline & my-pipeline

| Route                            | Method    | Test file                       | Cases    |
| -------------------------------- | --------- | ------------------------------- | -------- |
| `/api/my-pipeline`               | GET       | `my-pipeline-route.test.ts`     | 401, 200 |
| `/api/jobs/[id]/pipeline-stages` | GET, POST | `pipeline-stages-route.test.ts` | covered  |

### Billing

| Route                   | Method | Test file                | Cases                           |
| ----------------------- | ------ | ------------------------ | ------------------------------- |
| `/api/billing/checkout` | POST   | `billing-routes.test.ts` | 401, 403, 400 invalid plan, 200 |
| `/api/billing/portal`   | POST   | `billing-routes.test.ts` | 401, 403, 404 no customer, 200  |

### Notifications & messages

| Route                            | Method     | Test file                               | Cases    |
| -------------------------------- | ---------- | --------------------------------------- | -------- |
| `/api/notifications`             | GET, PATCH | `notifications-route.test.ts`           | 401, 200 |
| `/api/messages`                  | GET, POST  | `messages-route.test.ts`                | 401, 200 |
| `/api/messages/[conversationId]` | GET        | `messages-conversationId-route.test.ts` | 401, 200 |

### Profiles & preferences

| Route                            | Method     | Test file                              | Cases    |
| -------------------------------- | ---------- | -------------------------------------- | -------- |
| `/api/profiles`                  | GET, PATCH | `profiles-route.test.ts`               | 401, 200 |
| `/api/email-preferences`         | GET, PATCH | `email-preferences-route.test.ts`      | 401, 200 |
| `/api/candidates/me/preferences` | GET, PATCH | `candidates-preferences-route.test.ts` | 401, 200 |

### Admin

| Route                      | Method     | Test file              | Cases         |
| -------------------------- | ---------- | ---------------------- | ------------- |
| `/api/admin/users`         | GET, POST  | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/organisations` | GET, POST  | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/feature-flags` | GET, PATCH | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/agents`        | GET, POST  | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/analytics`     | GET        | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/billing`       | GET        | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/plan-limits`   | GET        | `admin-routes.test.ts` | 401, 403, 200 |
| `/api/admin/scrape`        | POST       | `admin-routes.test.ts` | 401, 403, 200 |

### Agency

| Route                              | Method    | Test file                                   | Cases         |
| ---------------------------------- | --------- | ------------------------------------------- | ------------- |
| `/api/agency/clients`              | GET, POST | `agency-clients-route.test.ts`              | 401, 403, 200 |
| `/api/agency/upload-profile`       | POST      | `agency-upload-profile-route.test.ts`       | 401, 200      |
| `/api/agency/upload-profile/bulk`  | POST      | `agency-upload-profile-bulk-route.test.ts`  | 401, 200      |
| `/api/agency/reprocess-candidates` | POST      | `agency-reprocess-candidates-route.test.ts` | 401, 200      |
| `/api/agency/backfill-pipeline`    | POST      | `agency-backfill-pipeline-route.test.ts`    | 401, 200      |
| `/api/agency/rescore-candidates`   | POST      | `agency-rescore-route.test.ts`              | 401, 403, 400 |

### Employees

| Route                           | Method | Test file                                                   | Cases         |
| ------------------------------- | ------ | ----------------------------------------------------------- | ------------- |
| `/api/employees/refer`          | POST   | `employees-refer-route.test.ts`, `employees-routes.test.ts` | 401, 400, 200 |
| `/api/employees/my-referrals`   | GET    | `employees-routes.test.ts`                                  | 401, 200      |
| `/api/employees/open-positions` | GET    | `employees-routes.test.ts`                                  | 401, 200      |
| `/api/employees/resign`         | POST   | `employees-routes.test.ts`                                  | 401, 200      |
| `/api/employees/resign/dispute` | POST   | `employees-routes.test.ts`                                  | 401, 200      |

### Public / unauthenticated

| Route                 | Method | Test file               | Cases                               |
| --------------------- | ------ | ----------------------- | ----------------------------------- |
| `/api/contact`        | POST   | `public-routes.test.ts` | 400 validation, 429 rate limit, 200 |
| `/api/waitlist`       | POST   | `public-routes.test.ts` | 400, 200                            |
| `/api/waitlist/count` | GET    | `public-routes.test.ts` | 200                                 |

### Apply (public + auth)

| Route               | Method | Test file              | Cases           |
| ------------------- | ------ | ---------------------- | --------------- |
| `/api/apply`        | POST   | `apply-routes.test.ts` | 400, 200 apply  |
| `/api/apply/[slug]` | GET    | `apply-routes.test.ts` | 200 job by slug |

### Invites

| Route                  | Method    | Test file                     | Cases                                                      |
| ---------------------- | --------- | ----------------------------- | ---------------------------------------------------------- |
| `/api/invites/[token]` | GET, POST | `invites-token-route.test.ts` | 404, 410 used/expired, 200 get; 401, 403 email, 200 accept |

### Cron (internal auth)

| Route                       | Method    | Test file                        | Cases                    |
| --------------------------- | --------- | -------------------------------- | ------------------------ |
| `/api/cron/cleanup`         | POST      | `cron-routes.test.ts`            | 401 invalid key, 200     |
| `/api/cron/reminders`       | POST      | `cron-routes.test.ts`            | 401, 200                 |
| `/api/cron/job-alerts`      | POST      | `cron-routes.test.ts`            | 401, 200                 |
| `/api/cron/process-signals` | POST      | `cron-routes.test.ts`            | 401, 200                 |
| `/api/cron/resignations`    | GET       | `cron-extra-routes.test.ts`      | 401 invalid secret, 200  |
| `/api/cron/trust`           | POST      | `cron-trust-route.test.ts`       | 401, 200                 |
| `/api/cron/score-batch`     | POST      | `cron-score-batch-route.test.ts` | 401, 200                 |
| `/api/cron/embed`           | POST, GET | `cron-embed-route.test.ts`       | 401, 200, 500 on failure |

### Webhooks

| Route                    | Method | Test file                         | Cases                    |
| ------------------------ | ------ | --------------------------------- | ------------------------ |
| `/api/webhooks/stripe`   | POST   | `stripe-webhook.test.ts`          | 400, 200 events          |
| `/api/webhooks/whatsapp` | POST   | `webhooks-whatsapp-route.test.ts` | 200, rate limit, handler |

### Other

| Route                        | Method             | Test file                             | Cases                          |
| ---------------------------- | ------------------ | ------------------------------------- | ------------------------------ |
| `/api/organisations`         | GET, POST          | `organisations-route.test.ts`         | 401, 200                       |
| `/api/organisations/members` | GET, POST          | `organisations-members-route.test.ts` | 401, 403, 400, 200             |
| `/api/saved-searches`        | GET, POST          | `saved-searches-route.test.ts`        | 401, 200                       |
| `/api/saved-searches/[id]`   | GET, PATCH, DELETE | `saved-searches-id-route.test.ts`     | 401, 404, 400, 200             |
| `/api/resume-versions`       | GET                | `resume-versions-route.test.ts`       | 401, 200                       |
| `/api/feedback/hire`         | POST               | `feedback-hire-route.test.ts`         | 401, 403, 400, 422, 404        |
| `/api/signals/ingest`        | POST               | `signals-ingest-route.test.ts`        | 401/202                        |
| `/api/openapi`               | GET                | `openapi-route.test.ts`               | 200 spec served, 404 not found |
| `/api/inngest`               | POST               | `inngest-route.test.ts`               | registration / handler wiring  |
| `/api/agents/ghostbuster`    | POST               | `agents-ghostbuster-route.test.ts`    | 401, 403, 400, 200             |

### Debug / dev (optional)

| Route                          | Method | Test file | Cases    |
| ------------------------------ | ------ | --------- | -------- |
| `/api/debug/env`               | GET    | —         | Optional |
| `/api/debug/test-upload-e2e`   | POST   | —         | Optional |
| `/api/debug/test-resume-parse` | POST   | —         | Optional |
| `/api/seed/finstack`           | POST   | —         | Optional |

---

## Running tests

```bash
npm run test           # all vitest
npm run test:unit      # unit only
npm run test:functional
npm run test:component
npm run test:e2e       # Playwright
npm run test:coverage  # with coverage
```

## Adding a new test for a route

1. In `tests/unit/`, create or extend a file e.g. `my-route.test.ts`.
2. Mock `@/lib/api-helpers` (`getAuthContext`, `requireAuth`, `hasRole`, `jsonError`, `jsonSuccess`).
3. Mock `@/lib/supabase/server` and `@/lib/supabase/admin` as needed.
4. For each HTTP method: unauthenticated → 401; wrong role → 403; invalid body → 400/422; valid → 200/201.
5. Update this plan with the new file and cases.
