# API Overview

**Last updated:** 2026-04-24 (per-job knockout screening routes and `screeningAnswers` on apply).

High-level reference for critical HTTP APIs. Auth: most routes require a valid session (Supabase Auth). Responses use `{ data }` on success and `{ error: string }` on failure unless noted.

**CORS:** The API is same-origin only by default. For cross-origin access, configure an allowlist of origins; do not use `*` in production.

**Logging context:** When logging errors or reporting to Sentry, use `apiLogContext(route, ctx)` from `@/lib/api-helpers` so all routes use a consistent set of fields: `route`, `userId` (when authenticated), and `requestId` (correlation ID when available).

---

## Health

| Method | Path                  | Auth | Description                                                    |
| ------ | --------------------- | ---- | -------------------------------------------------------------- |
| GET    | `/api/health`         | No   | Liveness. Returns `200` with `{ ok: true }`.                   |
| GET    | `/api/health?ready=1` | No   | Readiness. Pings DB; returns `503` if unavailable, else `200`. |

---

## Auth

| Method | Path                       | Description                                                                                   |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`          | Body: `{ email, password }`. Returns user, role, `redirectTo`.                                |
| POST   | `/api/auth/register`       | Body: `{ email, password, fullName, userType, organisationName? }`. Creates user and profile. |
| POST   | `/api/auth/ensure-profile` | Ensures current user has a profile; creates one with role `candidate_free` if missing.        |

---

## Applications

| Method | Path                     | Description                                                                                                                                                                                                                                                 |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/applications`      | Query: `page`, `limit`, `status?`, `jobId?`. Role-based list (candidate: own; recruiter: org’s).                                                                                                                                                            |
| POST   | `/api/applications`      | Body: `{ jobId, fitScoreId?, interest?, coverNote?, source?, confidentialApply?, screeningAnswers? }`. If the job has **active** knockout questions, include `screeningAnswers: [{ questionId, answerYes }]` (validated server-side; errors `400` / `403`). |
| GET    | `/api/applications/[id]` | Single application with job and candidate details. Response also includes `screeningAnswers` (question text, `answerYes`, `failOnYes`, `passed`) when stored — empty array if none.                                                                         |
| PATCH  | `/api/applications/[id]` | Body: `{ status }`. Candidate: `withdrawn` only. Recruiter: viewed/shortlisted/rejected/hired.                                                                                                                                                              |

### Public apply (unauthenticated, CSRF + rate limit)

| Method | Path                | Description                                                                                                                                                                                  |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/apply`        | `multipart/form-data`: `file`, `slug` (org), optional `jobId`, `name`, `phone`, `email`, `ref`, `source`, **`screeningAnswers`** (JSON string) when `jobId` and job have knockout questions. |
| GET    | `/api/apply/[slug]` | Open jobs for org. Query `?job=<jobId>` adds `screeningQuestions` (public fields only) for that open role.                                                                                   |

### Candidate: pre-screen before authenticated apply

| Method | Path                                        | Description                                                                       |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/jobs/[id]/public-screening-questions` | Logged-in candidate; yes/no questions for an **open** job (no knockout metadata). |

---

## Jobs

| Method | Path                                       | Description                                                                                       |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/jobs`                                | List jobs (org-scoped for recruiters; hiring manager: own).                                       |
| GET    | `/api/jobs/[id]`                           | Single job; recruiter/hiring_manager access by org/ownership.                                     |
| GET    | `/api/jobs/[id]/public`                    | Public job details for open jobs only (no auth).                                                  |
| POST   | `/api/jobs`                                | Create job (recruiter/company_admin).                                                             |
| PATCH  | `/api/jobs/[id]`                           | Update job.                                                                                       |
| GET    | `/api/jobs/[id]/screening-questions`       | List knockout questions (recruiter / org; includes `failOnYes`, `isActive`).                      |
| POST   | `/api/jobs/[id]/screening-questions`       | Create question (recruiter/admin). Body: `questionText`, `failOnYes?`, `sortOrder?`, `isActive?`. |
| GET    | `/api/jobs/[id]/screening-questions/[qid]` | Single question.                                                                                  |
| PATCH  | `/api/jobs/[id]/screening-questions/[qid]` | Update question.                                                                                  |
| DELETE | `/api/jobs/[id]/screening-questions/[qid]` | Delete question.                                                                                  |

---

## Candidates

| Method | Path                          | Description                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/candidates`             | Query: search, skills, location, pagination. Masked list for recruiters. |
| GET    | `/api/candidates/[id]`        | Single candidate (owner or recruiter with unlock).                       |
| POST   | `/api/candidates/[id]/unlock` | Body: `{ jobId }`. Recruiter unlocks contact (credits).                  |

---

## Notifications

| Method | Path                 | Description                                             |
| ------ | -------------------- | ------------------------------------------------------- |
| GET    | `/api/notifications` | Query: `limit?`. List for current user; `unreadCount`.  |
| PATCH  | `/api/notifications` | Body: `{ ids? }` or `{ markAllRead: true }`. Mark read. |

---

## Billing

| Method | Path                    | Description                                                                      |
| ------ | ----------------------- | -------------------------------------------------------------------------------- |
| POST   | `/api/billing/checkout` | Body: `{ plan, type: "company" \| "candidate" }`. Returns Stripe checkout `url`. |
| POST   | `/api/billing/portal`   | Returns Stripe customer portal `url` for current org or user.                    |

---

## Webhooks & Cron

- `POST /api/webhooks/stripe` — Stripe webhook (signature verified).
- `POST /api/webhooks/whatsapp` — WhatsApp webhook (GET for verification, POST for events).
- **Customer outbound (HRIS / automation):** Inngest fanout delivers HMAC-signed JSON to URLs registered per org. Configure via:
  - `GET/POST /api/settings/org/outbound-webhooks` — list / create (returns `signingSecret` **once** on create).
  - `PATCH/DELETE /api/settings/org/outbound-webhooks/[id]`.
  - Requires `manage_integrations` capability. Signature: `X-TigerHire-Signature: t=<unix>,v1=<hex>` over `${t}.${rawBody}`. Emitted event types (when `eventTypes` is `["*"]` or includes the name) include: `application.submitted`, `offer.candidate_responded`, `offer.signed` (data payloads match internal records; no PII beyond IDs unless present in the row).
- Cron routes (e.g. `/api/cron/embed`, `/api/cron/reminders`) require `Authorization: Bearer <CRON_SECRET>`.

For full request/response shapes and validation, see route handlers and Zod schemas in `src/app/api/`.

---

## Database transactions

Flows that rely on multi-step DB consistency:

- **Stripe webhook** (`POST /api/webhooks/stripe`): Uses RPCs `stripe_event_try_acquire`, `stripe_checkout_company` / `stripe_checkout_candidate`, and subscription updates for atomicity.
- **Agency upload** (`POST /api/agency/upload-profile`, bulk): Creates candidate, application, and fit_score in sequence; consider a single RPC if strict atomicity is required.
- **Signals ingest** (`POST /api/signals/ingest`): Single upsert with `onConflict` for deduplication.

When adding new flows that must be atomic (e.g. create candidate + application + fit_score in one step), use a single Supabase RPC or documented transaction pattern.
