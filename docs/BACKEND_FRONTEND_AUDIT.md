# Backend–Frontend Audit

**Date:** 2026-04-24 (refreshed; methodology unchanged)  
**Scope:** All API routes under `src/app/api/` vs frontend usage in `src/app/` and `src/components/`.

---

## Summary

- **User-facing APIs** that have **no frontend usage** (gaps): **11**
- **Frontend flows** that expect backend: all major flows have corresponding APIs.
- **Intentionally backend-only** (cron, webhooks, auth callbacks, health, platform-owned billing, etc.) are excluded from “gaps.”

---

## 1. Backend APIs with no frontend usage (gaps)

These routes exist but are never called from the app UI. Either wire them in the frontend or treat them as future/API-only.

| API Route                                  | Methods           | Notes                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/api/candidates/[id]/unlock`**          | POST              | Unlock candidate contact (uses credits). `FitScoreCard` has an “Unlock Contact” button and `onUnlock` prop, but **no page passes a handler** that calls this API, so the button never appears or does nothing. |
| **`/api/candidates/[id]/notes`**           | GET, POST         | Recruiter notes on a candidate. No UI to view or add notes.                                                                                                                                                    |
| **`/api/candidates/me/preferences`**       | GET, PATCH        | Candidate job preferences (locations, remote, seniority, salary). No candidate “preferences” or “job alerts” page.                                                                                             |
| **`/api/org/pipeline-defaults`**           | GET, POST, DELETE | Org-level pipeline default stages. No settings UI for pipeline defaults.                                                                                                                                       |
| **`/api/fit-score/[id]`**                  | GET               | Fetch FitScore by ID. Frontend uses `GET /api/fit-score?jobId=&candidateId=` instead; this route is unused.                                                                                                    |
| **`/api/jobs/[id]/interviews/reschedule`** | POST              | Reschedule an existing interview. Only book and cancel are used in the interviews UI.                                                                                                                          |
| **`/api/jobs/[id]/pipeline/bulk`**         | POST              | Bulk pipeline updates. Frontend updates one candidate at a time via `PATCH /api/jobs/[id]/pipeline/candidates/[pcId]`.                                                                                         |
| **`/api/admin/users/reset-password`**      | POST              | Admin resets a user’s password. No button or form in admin users page.                                                                                                                                         |
| **`/api/admin/users/audit-log`**           | GET               | Admin audit log. No admin UI for audit log.                                                                                                                                                                    |
| **`/api/employees/resign/dispute`**        | POST              | Company admin disputes an employee’s resignation (48h window). No company admin UI for disputes.                                                                                                               |
| **`/api/agency/upload-profile/bulk`**      | POST              | Bulk upload candidate profiles. Only single-file upload is used in agency clients UI.                                                                                                                          |

---

## 2. Backend-only routes (no frontend expected)

Not considered gaps; used by systems, not by the SPA.

- **Cron:** `cron/*` (job-alerts, process-signals, reminders, score-batch, cleanup, embed, resignations, interview-reminders, user-count-monitor, trust)
- **Webhooks:** `webhooks/stripe`, `webhooks/whatsapp`
- **Auth:** `auth/callback`, `auth/callback/[...rest]`, `auth/oauth-redirect-url`, `auth/google` (redirects)
- **Other:** `health`, `openapi`, `inngest`, `signals/ingest`, `apply` (public server-side, incl. pre-screen / `screeningAnswers` with `jobId`), `apply/[slug]` (GET: open jobs + optional `?job=` for knockout questions)
- **Platform billing (intentional):** `billing/checkout`, `billing/portal` are platform/super-admin-owned and intentionally not company-admin UI features.
- **Debug (dev):** `auth/test-login`, `auth/seed-demo-users`, `debug/*`

---

## 3. Frontend → Backend mapping (verified)

All major UI flows have a corresponding API:

| Area            | Frontend                                                                                                                                          | Backend                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | Login, register, forgot-password, SSO, logout, ensure-profile, link                                                                               | login, register, forgot-password, sso, logout, ensure-profile, link, callback                                                               |
| Invites         | `invite/[token]` (GET + accept)                                                                                                                   | `invites/[token]` GET, POST                                                                                                                 |
| Jobs            | List, create, get, update, delete, upload-jd, parse-jd-url, generate-jd, public, **job screening (recruit UI + APIs)**                            | jobs, jobs/[id], jobs/upload-jd, parse-jd-url, generate-jd, jobs/[id]/public, jobs/[id]/screening-questions, public-screening-questions     |
| Pipeline        | my-pipeline, approvals, pipeline/approve, pipeline/candidates/[pcId], pipeline/request-interview, pipeline-stages, shortlist, availability (CRUD) | my-pipeline, approvals, jobs/[id]/pipeline/approve, pipeline/candidates/[pcId], request-interview, pipeline-stages, shortlist, availability |
| Interviews      | book, cancel, ics, availability                                                                                                                   | jobs/[id]/interviews/book, cancel, ics; availability                                                                                        |
| FitScore        | fit-score (query), fitscore/select-blend                                                                                                          | fit-score, fitscore/select-blend                                                                                                            |
| Candidates      | candidates, candidates/[id], resumes, upload-resume, erasure, export                                                                              | Same + candidates/upload-resume, erasure, export                                                                                            |
| Applications    | applications (apply + `screeningAnswers`), applications/[id] (GET `screeningAnswers` for Q/A), applications/stats                                 | applications, applications/[id], applications/stats                                                                                         |
| Hiring requests | hiring-requests, hiring-requests/[id]                                                                                                             | hiring-requests, hiring-requests/[id]                                                                                                       |
| Saved searches  | saved-searches CRUD                                                                                                                               | saved-searches, saved-searches/[id]                                                                                                         |
| Messages        | messages, messages/[conversationId]                                                                                                               | messages, messages/[conversationId]                                                                                                         |
| Notifications   | notifications (dropdown + page)                                                                                                                   | notifications                                                                                                                               |
| Profile & org   | profiles, email-preferences, organisations, organisations/members                                                                                 | Same                                                                                                                                        |
| Admin           | analytics, users (GET/PATCH/POST), feature-flags, plan-limits, billing, scrape, agents, organisations                                             | admin/analytics, admin/users, feature-flags, plan-limits, billing, scrape, agents; organisations                                            |
| Agency          | clients, upload-profile, backfill-pipeline, rescore-candidates, reprocess-candidates, pipeline/candidates                                         | agency/clients, upload-profile, backfill-pipeline, rescore-candidates, reprocess-candidates; jobs/…/pipeline/candidates                     |
| Employee        | resign, refer, my-referrals, open-positions                                                                                                       | employees/resign, refer, my-referrals, open-positions                                                                                       |
| Recruit         | verify, feedback, feedback-templates, orchestrator, orchestrator/approve                                                                          | approvals, jobs/…/pipeline/approve, feedback, feedback-templates, orchestrator, orchestrator/approve                                        |
| Public          | apply, apply/[slug], waitlist, waitlist/count, contact                                                                                            | apply, apply/[slug], waitlist, waitlist/count, contact                                                                                      |

---

## 4. Recommendations

1. **Unlock flow:** On recruit/agency candidate and job detail views, pass an `onUnlock` handler to `FitScoreCard` that calls `POST /api/candidates/[id]/unlock` with `{ jobId }`, then refetches scores/candidate so “Unlock Contact” works and consumes credits.
2. **Candidate notes:** Add a “Notes” section or drawer on candidate detail that uses `GET/POST /api/candidates/[id]/notes`.
3. **Candidate preferences:** Add a “Job preferences” or “Alert preferences” page under candidate dashboard that uses `GET/PATCH /api/candidates/me/preferences`.
4. **Pipeline defaults:** If org-level default stages are needed, add a settings section that uses `GET/POST/DELETE /api/org/pipeline-defaults`.
5. **Reschedule:** In the interviews UI, add “Reschedule” for an existing booking and call `POST /api/jobs/[id]/interviews/reschedule`.
6. **Admin:** Add “Reset password” and “Audit log” to the admin users area using `POST /api/admin/users/reset-password` and `GET /api/admin/users/audit-log`.
7. **Resignation dispute:** If company admins should be able to dispute resignations, add a company admin view that calls `POST /api/employees/resign/dispute`.
8. **Bulk upload (agency):** If agency should support bulk CSV/profile upload, add UI that calls `POST /api/agency/upload-profile/bulk`.
9. **Optional cleanup:** If `GET /api/fit-score/[id]` is not used by mobile or other clients, consider deprecating it in favor of the query-param FitScore API; similarly, only add frontend for `pipeline/bulk` if you want bulk actions.

---

## 5. Invite route path

Frontend uses **`/api/invites/${token}`** (e.g. in `invite/[token]/page.tsx`). Backend route is **`invites/[token]/route.ts`**, which serves **`/api/invites/[token]`**. So the path matches and there is no gap.
