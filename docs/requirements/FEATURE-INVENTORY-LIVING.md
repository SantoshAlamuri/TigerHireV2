# TigerHire — Living feature inventory

**Purpose:** Single place to see **what exists in the repo** (UI, APIs, libs, jobs), at a **feature** level—not a product sign-off. Use it for onboarding, scoping, and gap reviews.  
**Maintainers:** Update this file when you ship or retire a capability; keep **one row truthful** rather than perfect exhaustiveness.

**Last reviewed:** 2026-04-24

---

## Related trackers (PRD vs repo)

| Document                                                                                           | Role                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [FEATURE-BACKLOGS-MASTER.md](./FEATURE-BACKLOGS-MASTER.md)                                         | **One-page index** of partial / pending / activities + links                |
| [SPRINT-PLAN-BACKLOG-TO-DONE.md](./SPRINT-PLAN-BACKLOG-TO-DONE.md)                                 | **Sprint program** (Sprint 0–6+) to close gap rows                          |
| [ROLE-QUESTIONS-BUILT-VS-BACKLOG.md](./ROLE-QUESTIONS-BUILT-VS-BACKLOG.md)                         | Stakeholder **questions by role** vs build status (onboarding / sales / PM) |
| [PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md](./PRD-FULL-Gap-Tracker-TigerHire-vs-GoPerfect.md) | PRD row status (`done` / `partial` / `not_started`)                         |
| [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md)                         | Sequencing, New vs Edit, tier A/B/C                                         |
| [SPRINT-PRD-MVP.md](./SPRINT-PRD-MVP.md)                                                           | Near-term MVP slice (F1, F3, F8)                                            |
| [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md)                                       | Classic ATS checklist: partial areas, P-priority, exit criteria             |
| [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md)                                                     | Epic specs (workflow, IJP, webhooks, integrations, …)                       |

When **code** and **PRD tracker** disagree, update **both**: this file describes _implementation_; the gap tracker describes _PRD acceptance_. When you close a **partial** row from the ATS backlog, update **this file** and [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) together.

---

## Status legend

| Status           | Meaning                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| **Shipped**      | Used in production paths; coherent UX + API + data (may still need polish).  |
| **Partial**      | Code exists; incomplete vs intended product scope, or depends on env/config. |
| **Experimental** | Behind flags, admin-only, or stubbed—do not assume tenant-facing stability.  |
| **Not in repo**  | No meaningful implementation (may be planned in PRD only).                   |

---

## 1. Personas & dashboard surfaces

Dashboard routes live under `src/app/(dashboard)/`. Primary areas:

| Persona / area          | Example routes                                                                                                                                                    | Notes                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Recruit**             | `recruit/`, `recruit/jobs/`, `recruit/pipeline/`, `recruit/candidates/`, `recruit/offers/`, `recruit/hiring-requests/`, `recruit/analytics/`, `recruit/settings/` | Core recruiter workflow.       |
| **Company**             | `company/`, `company/jobs/`, `company/hiring-requests/`, `company/offers/`, `company/finance/`, `company/approvals/`, `company/settings/`                         | Employer org admin + hiring.   |
| **Candidate**           | `candidate/`, `candidate/jobs/`, `candidate/applications/`, `candidate/profile/`                                                                                  | Logged-in candidate.           |
| **Agency**              | `agency/`, `agency/jobs/`, `agency/pipeline/`, `agency/candidates/`                                                                                               | Agency workflows + bulk paths. |
| **Admin**               | `admin/`, `admin/users/`, `admin/organisations/`, `admin/agents/`, `admin/feature-flags/`                                                                         | Platform operations.           |
| **Employee / referrer** | `employee/`, `dashboard/referrer/`                                                                                                                                | Referrals, resign flow.        |
| **Shared**              | `notifications/`, `messages/`, `profile/`                                                                                                                         | Cross-role.                    |

**Public marketing / apply:** `src/app/(public)/` — e.g. `apply/[slug]`, `jobs/`, `assessments/[token]`, refer join/login.

---

## 2. Auth, identity, security

| Feature             | Status  | Where to look                                                                                               |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Email/password auth | Shipped | `src/app/api/auth/` (`login`, `register`, `logout`, `forgot-password`, `callback`)                          |
| Google OAuth        | Partial | `src/app/api/auth/google/`, settings OAuth routes                                                           |
| SSO / Entra         | Partial | `src/app/api/auth/sso/`, `src/app/api/auth/entra/sync/`                                                     |
| SCIM (admin)        | Partial | `src/app/api/scim/v2/`, `src/app/(dashboard)/admin/settings/scim/`                                          |
| RBAC & route policy | Shipped | `src/lib/security/rbac.ts`, `src/lib/security/dashboard-route-policy.ts`, `src/lib/settings/permissions.ts` |
| Tenant isolation    | Shipped | `src/lib/tenancy/tenant-scoped-client.ts`, `src/lib/api-helpers.ts`                                         |
| CSRF / rate limits  | Shipped | `src/lib/security/csrf.ts`, `src/lib/security/rate-limit.ts`                                                |
| PII / sanitization  | Partial | `src/lib/security/pii.ts`, validations across `src/lib/validations/`                                        |

---

## 3. Jobs, JD, distribution

| Feature                       | Status  | Where to look                                                                                                                     |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Job CRUD                      | Shipped | `src/app/api/jobs/`, `recruit/jobs/`, `company/jobs/`                                                                             |
| JD parse (text / URL)         | Shipped | `src/app/api/jobs/parse-jd-text/`, `parse-jd-url/`, `upload-jd/`                                                                  |
| JD intelligence (agent)       | Partial | `src/app/api/agents/jd-intelligence/`, `src/lib/agents/`                                                                          |
| Job board distribution        | Partial | `src/lib/distribution/`, `src/app/api/org/job-board-credentials/`, company settings job boards                                    |
| Public job pages & XML feed   | Shipped | `src/app/(public)/jobs/`, `src/app/api/jobs/feed.xml/`                                                                            |
| Orchestrator (job automation) | Partial | `src/app/api/jobs/[id]/orchestrator/`, `src/inngest/functions.ts` (`orchestratorAdvance`), `src/lib/agents/orchestrator-steps.ts` |

---

## 4. Applications & apply

| Feature                                                  | Status      | Where to look                                                                                                                                                                                          |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apply from public slug                                   | Shipped     | `src/app/(public)/apply/[slug]/`, `POST /api/apply` (form: optional `screeningAnswers` JSON when `jobId` + job has active knockout questions)                                                          |
| Get open jobs + pre-screen for apply                     | Shipped     | `GET /api/apply/[slug]`, `?job=<jobId>` returns `screeningQuestions` (id + text + sort; no `fail` metadata)                                                                                            |
| Applications API                                         | Shipped     | `src/app/api/applications/` — `POST` may include `screeningAnswers`; **`GET` `[id]`** returns `screeningAnswers` ( `src/lib/screening/fetch-application-screening-display.ts` ) for authorized viewers |
| Candidate: load pre-screen for match-feed apply          | Shipped     | `src/app/api/jobs/[id]/public-screening-questions/route.ts` (candidates; open jobs only)                                                                                                               |
| Per-job screening answers in DB                          | Shipped     | `application_screening_answers` + service writes via `src/lib/screening/application-screening-answers.ts`                                                                                              |
| Application stats                                        | Partial     | `src/app/api/applications/stats/`                                                                                                                                                                      |
| Multi-channel inbound (ATS, email parser) unified worker | Not in repo | PRD F1-01 — see gap tracker                                                                                                                                                                            |

---

## 5. FitScore, screening, agents

| Feature                                                                   | Status  | Where to look                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FitScore API & scoring                                                    | Shipped | **Production:** Hybrid FitScore v2 (`src/lib/fitscore/hybrid/`, `POST /api/fitscore/score`). **Research only:** `src/lib/fitscore/v3/` (not a parallel production stack). Legacy `POST /api/fit-score` retained for compatibility.                                                                                                                                                                                                                                             |
| Inngest: single + batch score                                             | Shipped | `src/inngest/functions.ts` — `fitScoreSingle`, `fitScoreBatch`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Per-job knockout (yes/no) screening**                                   | Shipped | `supabase/migrations/20260424090000_job_screening_questions.sql`; `src/lib/screening/job-screening.ts` (evaluate + public question shape); `src/lib/screening/fetch-application-screening-display.ts` (recruiter read on `GET` application); `GET/POST` `src/app/api/jobs/[id]/screening-questions/`, `GET/PATCH/DELETE` `.../screening-questions/[qid]/`; RLS: public read active Qs for open jobs; [ATS partial §5](./ATS-PARTIAL-GAPS-BACKLOG.md#5-screening-and-selection) |
| JD base / templates                                                       | Partial | `src/app/api/fitscore/jd-base/`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Screening / Candidate Authenticity Check / communication / outcome agents | Partial | `src/app/api/agents/screening`, `ghostbuster`, `communication`, `outcome-signal`, `src/lib/agents/` — **LLM/pipeline** screening agents (API path `ghostbuster` is internal), not the per-job `job_screening_questions` knockout flow (see row above)                                                                                                                                                                                                                          |
| Run pipeline agent                                                        | Partial | `src/app/api/agents/run-pipeline/`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FitScore feedback & export                                                | Partial | `src/app/api/fit-score/feedback/`, `export` — not full “every computation” audit (PRD F3-05)                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 6. Pipeline & hiring stages

| Feature                                   | Status  | Where to look                                                                                      |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Job pipeline bulk / candidate moves       | Shipped | `src/app/api/jobs/[id]/pipeline/`                                                                  |
| Org pipeline defaults                     | Shipped | `src/app/api/org/pipeline-defaults/`                                                               |
| Job pipeline stages CRUD & reset from org | Shipped | `src/app/api/jobs/[id]/pipeline-stages/`, `src/lib/pipeline/`                                      |
| Pipeline UI (recruit + agency)            | Shipped | `recruit/pipeline/`, `agency/pipeline/`, `recruit/jobs/[id]/pipeline-stages/`                      |
| SLA helpers / cron                        | Partial | `src/lib/pipeline/sla-status.ts`, `src/app/api/cron/workflow-sla/`                                 |
| Stage dwell analytics                     | Partial | `src/app/api/analytics/stage-dwell/` (PRD-style “TAT export” may still be incomplete — see gap A1) |

---

## 7. Candidates, profiles, resumes, unlock

| Feature                     | Status  | Where to look                                                       |
| --------------------------- | ------- | ------------------------------------------------------------------- |
| Candidate listing & detail  | Shipped | `src/app/api/candidates/`, `recruit/candidates/`                    |
| Resume upload & versions    | Shipped | `src/app/api/candidates/upload-resume/`, `candidates/[id]/resumes/` |
| Notes                       | Shipped | `src/app/api/candidates/[id]/notes/`                                |
| Preferences                 | Shipped | `src/app/api/candidates/me/preferences/`                            |
| Unlock / credits (sourcing) | Partial | `src/app/api/candidates/[id]/unlock/`, billing entitlements         |
| Erasure                     | Shipped | `src/app/api/candidates/erasure/`                                   |

---

## 8. Interviews & interview prep

| Feature                      | Status  | Where to look                                                                       |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Book / reschedule interviews | Shipped | `src/app/api/jobs/[id]/interviews/book/`, `reschedule/`                             |
| Interviewer API              | Shipped | `src/app/api/interviewer/interviews/`                                               |
| Interview prep (API + UI)    | Partial | `src/app/api/interview-prep/`, `recruit/interview-prep/`, `company/interview-prep/` |

---

## 9. Hiring requests & generic approvals

| Feature                    | Status  | Where to look                                                     |
| -------------------------- | ------- | ----------------------------------------------------------------- |
| Hiring requests API        | Shipped | `src/app/api/hiring-requests/`                                    |
| Hiring request UI          | Shipped | `recruit/hiring-requests/`, `company/hiring-requests/`            |
| Tokenized approval actions | Shipped | `src/app/api/approvals/`, `src/app/api/approvals/action/[token]/` |
| Company approvals hub      | Shipped | `company/approvals/`                                              |

---

## 10. Offers (draft → approval → send → signing)

| Feature                                              | Status                      | Where to look                                                                                                                                                                                            |
| ---------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offers CRUD & send                                   | Shipped                     | `src/app/api/offers/`, `src/app/api/offers/[id]/`                                                                                                                                                        |
| Finance decision on offer                            | Shipped                     | `src/app/api/offers/[id]/finance/`                                                                                                                                                                       |
| Hiring manager approve                               | Shipped                     | `src/app/api/offers/[id]/hiring-manager-approve/`, `src/lib/offers/offer-hm-approval.ts`                                                                                                                 |
| Finance workflow settings                            | Shipped                     | `src/app/api/settings/offer-finance-workflow/`, `src/lib/workflows/offer-finance-workflow.ts`                                                                                                            |
| Offer approval workflow UI                           | Shipped                     | `recruit/settings/offer-approval-workflow/`, `company/settings/offer-approval-workflow/`                                                                                                                 |
| Compensation bands                                   | Shipped                     | `src/app/api/compensation-bands/`, settings pages, `src/lib/offers/compensation-band-check.ts`                                                                                                           |
| CTC calculator & normalization                       | Shipped                     | `src/lib/offers/offer-ctc-calculator.ts`, `compensation-normalize.ts`, UI panels                                                                                                                         |
| Offer letter / PDF templates                         | Partial                     | `src/app/api/offer-pdf-templates/`, `src/lib/offers/generate-offer-pdf.ts`, template editor components                                                                                                   |
| Custom merge fields                                  | Partial                     | `src/lib/offers/offer-custom-merge-fields.ts`, migrations, settings editor                                                                                                                               |
| Public offer link (OTP, view)                        | Shipped                     | `src/app/api/offers/public/[token]/`, OTP send/verify                                                                                                                                                    |
| **Native candidate signing** (accept/decline, audit) | Shipped                     | `public/.../sign`, `decline`, `view`, `download`; `src/lib/offers/offer-events.ts`, `offer-signing-pipeline.ts`, `offer-native-notifications.ts`; migration `supabase/migrations/*native_offer_signing*` |
| Signing remind / extend                              | Shipped                     | `src/app/api/offers/[id]/signing/remind/`, `signing/extend/`, `src/app/api/offers/[id]/signing/`                                                                                                         |
| Signed PDF download (internal)                       | Shipped                     | `src/app/api/offers/[id]/download-signed/`                                                                                                                                                               |
| Offer recall / void                                  | Shipped                     | `src/app/api/offers/[id]/recall/`, `src/lib/offers/void-offer-envelope.ts`                                                                                                                               |
| Offer expiry cron                                    | Shipped                     | `src/app/api/cron/offer-expiry/` (`vercel.json`)                                                                                                                                                         |
| Third-party e-sign (DocuSign-class)                  | Not in repo (replaced path) | Native signing migration removes provider columns; re-add only if product requires vendor                                                                                                                |
| Placement fee / billing on offer                     | Partial                     | `src/lib/placement-fee/record-offer-billing.ts`                                                                                                                                                          |

**Public candidate offer page:** `src/app/offers/[token]/page.tsx`

---

## 11. Background verification (BGV)

| Feature                      | Status      | Where to look                                                                                    |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| Post-accept BGV Inngest hook | Partial     | `src/inngest/functions.ts` — `offerBgvTrigger`                                                   |
| SpringVerify initiate        | Partial     | `src/app/api/integrations/springverify/initiate/`, `src/lib/integrations/springverify/client.ts` |
| SpringVerify webhook         | Partial     | `src/app/api/webhooks/springverify/` (requires env + vendor contract)                            |
| Checkr-class full product    | Not in repo | Gap B3                                                                                           |

---

## 12. Assessments

| Feature                   | Status  | Where to look                                                                     |
| ------------------------- | ------- | --------------------------------------------------------------------------------- |
| Assessments CRUD & submit | Shipped | `src/app/api/assessments/`, templates routes                                      |
| Share token assessment    | Shipped | `src/app/api/assessments/share/[token]/`, `src/app/(public)/assessments/[token]/` |
| Assessment reminders cron | Shipped | `src/app/api/cron/assessment-reminders/`                                          |
| Auto-advance rules        | Partial | `src/lib/assessments/auto-advance.ts`                                             |

---

## 13. Analytics & exports

| Feature                | Status  | Where to look                                                                  |
| ---------------------- | ------- | ------------------------------------------------------------------------------ |
| Analytics API          | Shipped | `src/app/api/analytics/`, `analytics/export/`, `analytics/application-funnel/` |
| Recruit analytics page | Shipped | `recruit/analytics/`                                                           |
| Stage dwell            | Partial | `src/app/api/analytics/stage-dwell/`                                           |
| Admin costs            | Shipped | `src/app/api/admin/costs/`, `admin/costs/` UI                                  |

---

## 14. Messaging, notifications, email

| Feature                              | Status  | Where to look                                                       |
| ------------------------------------ | ------- | ------------------------------------------------------------------- |
| In-app messages API                  | Shipped | `src/app/api/messages/`                                             |
| Notifications API                    | Shipped | `src/app/api/notifications/`                                        |
| Email (Resend) templates             | Shipped | `src/lib/services/resend.ts`, `src/lib/services/email-templates.ts` |
| WhatsApp (sessions, webhooks, flows) | Partial | `src/lib/whatsapp/`, `src/app/api/admin/whatsapp-sessions/`         |

---

## 15. Billing, plans, entitlements

| Feature                           | Status                | Where to look                                                                    |
| --------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| Stripe checkout & portal          | Shipped               | `src/app/api/billing/checkout/`, `billing/portal/`, `src/lib/services/stripe.ts` |
| Stripe webhooks                   | Shipped               | `src/app/api/webhooks/stripe/`                                                   |
| Entitlements API                  | Shipped               | `src/app/api/entitlements/`                                                      |
| Plan limits (admin)               | Shipped               | `src/app/api/admin/plan-limits/`, UI                                             |
| Company billing page              | Shipped               | `company/billing/`                                                               |
| **Unlimited seats PRD alignment** | Not in repo / partial | PRD F8-01 — verify `company/billing` + team UX vs policy                         |

---

## 16. Referrals & refer program

| Feature                  | Status  | Where to look                                               |
| ------------------------ | ------- | ----------------------------------------------------------- |
| Refer join / OTP         | Shipped | `src/app/api/refer/`, public `refer/` pages                 |
| Referrer dashboard       | Shipped | `dashboard/referrer/`                                       |
| Company referrals        | Shipped | `company/referrals/`, `src/app/api/admin/export/referrers/` |
| Referral merge / helpers | Partial | `src/lib/referrers/`                                        |

---

## 17. Agency-specific

| Feature              | Status  | Where to look                                 |
| -------------------- | ------- | --------------------------------------------- |
| Agency pipeline bulk | Shipped | `src/app/api/agency/pipeline/bulk/`           |
| Bulk profile upload  | Shipped | `src/app/api/agency/upload-profile/`, `bulk/` |
| Rescore queue        | Partial | `src/app/api/agency/rescore-candidates/`      |
| Backfill pipeline    | Partial | `src/app/api/agency/backfill-pipeline/`       |

---

## 18. Admin & platform

| Feature                    | Status       | Where to look                                          |
| -------------------------- | ------------ | ------------------------------------------------------ |
| Users, orgs, feature flags | Shipped      | `src/app/api/admin/users/`, `organisations/`, admin UI |
| Audit log UI               | Shipped      | `admin/audit-log/`, `company/settings/audit/`          |
| Settings audit API         | Shipped      | `src/app/api/settings/audit/`                          |
| Agents admin               | Shipped      | `admin/agents/`, `src/app/api/admin/agents/`           |
| Scrape / tools             | Experimental | `admin/scrape/`, `src/app/api/admin/scrape/`           |

---

## 19. Settings & integrations (org + user)

| Feature                       | Status  | Where to look                                                                                                            |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Org integrations              | Shipped | `src/app/api/settings/org/integrations/`, `settings/integrations/`                                                       |
| Customer outbound webhooks    | Shipped | `src/app/api/settings/org/outbound-webhooks/`, `src/lib/webhooks/`, `src/inngest/functions.ts` (`webhookProcess` fanout) |
| User integrations & OAuth     | Shipped | `src/app/api/settings/me/integrations/`                                                                                  |
| Platform integrations (admin) | Partial | `src/app/api/settings/platform/integrations/`                                                                            |
| Permissions UI                | Shipped | `company/settings/permissions/`, API `settings/permissions/`                                                             |
| Privacy settings              | Shipped | `src/app/api/settings/privacy/`                                                                                          |

---

## 20. Saved searches & job alerts

| Feature                   | Status  | Where to look                                                               |
| ------------------------- | ------- | --------------------------------------------------------------------------- |
| Saved searches API        | Shipped | `src/app/api/saved-searches/`                                               |
| Recruit saved searches UI | Shipped | `recruit/saved-searches/`                                                   |
| Cron job alerts           | Shipped | `src/app/api/cron/job-alerts/` (job-focused; PRD F6 profile digest differs) |

**PRD reconciliation (job alerts vs “profile digest”):** The **shipped** automation is the **job-alerts** cron above (saved-criteria / job-matching style alerts). A separate **full candidate profile digest** (broader, F6-style) is **not** the same capability — do not use “digest” and “job-alerts” interchangeably in **sales** or support without checking this row. GTM one-pager: [../gtm/ESIGN-AND-INBOX-POSITIONING.md](../gtm/ESIGN-AND-INBOX-POSITIONING.md#job-alerts-vs-profile-digest). If a future digest ships, add a **new** row and cron entry; don’t relabel this row in place.

---

## 21. Cron schedules (`vercel.json`)

| Cron path                         | Purpose             |
| --------------------------------- | ------------------- |
| `/api/cron/process-signals`       | Signal processing   |
| `/api/cron/score-batch`           | Batch scoring       |
| `/api/cron/embed`                 | Embeddings          |
| `/api/cron/orchestrator-watchdog` | Orchestrator health |
| `/api/cron/reminders`             | General reminders   |
| `/api/cron/user-count-monitor`    | Usage monitoring    |
| `/api/cron/cost-sync`             | Cost sync           |
| `/api/cron/trust`                 | Trust checks        |
| `/api/cron/workflow-sla`          | Workflow SLA        |
| `/api/cron/offer-expiry`          | Offer expiry        |

---

## 22. Inngest (`src/inngest/functions.ts`)

| Function                       | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `fitScoreSingle`               | Single-application FitScore                              |
| `fitScoreBatch`                | Batch FitScore                                           |
| `jobDistribute`                | Distribute job to boards                                 |
| `jobRemoveFromBoards`          | Remove from boards                                       |
| `offerBgvTrigger`              | Post-offer BGV trigger                                   |
| `resumeParse`                  | Resume parsing pipeline                                  |
| `orchestratorAdvance`          | Orchestrator step advance                                |
| `pipelineReminder`             | Pipeline reminders                                       |
| `webhookProcess`               | Customer outbound webhook fanout (HMAC POST to org URLs) |
| `postHirePulseScheduler`       | Post-hire pulses                                         |
| `applicationDeadlineReminders` | Application deadline reminders                           |

---

## 23. Change log (inventory only)

Add a row when you materially change a feature area:

| Date       | Change                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-17 | Initial living inventory created from codebase layout + PRD trackers.                                                                                                                                                                                              |
| 2026-04-23 | Linked [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) and [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md) for classic ATS partial-gap tracking.                                                                                                       |
| 2026-04-23 | Customer **outbound webhooks** (HMAC, org API, Inngest fanout) — see §19 and `src/app/api/settings/org/outbound-webhooks/`.                                                                                                                                        |
| 2026-04-24 | **Per-job knockout (yes/no) screening** — DB, lib, recruit UI, public + candidate apply, APIs — see §4–5, migration `20260424090000_job_screening_questions`, `src/lib/screening/`, [ATS §5 partial row](./ATS-PARTIAL-GAPS-BACKLOG.md#5-screening-and-selection). |
| 2026-04-24 | **Screening answers in talent UI** — `GET /api/applications/[id]` includes `screeningAnswers`; recruit **candidate detail** (`recruit/candidates/[id]`, Hireability) shows pre-screen Q/A.                                                                         |
| 2026-04-24 | **PRD note for §20** — [job-alerts vs profile digest](../gtm/ESIGN-AND-INBOX-POSITIONING.md#job-alerts-vs-profile-digest) GTM; **nav** — HM sidebar Offers, candidate **Fit scores**; [USER-GUIDE-BY-ROLE.md](../help/USER-GUIDE-BY-ROLE.md) §13 table refresh.    |

---

## Maintenance checklist

1. After merging a feature: update the **relevant table row** (status + paths).
2. If PRD scope moves: update **PRD-FULL-Gap-Tracker** and a **one-line** note here if the feature name differs.
3. If you **remove** a capability: strike or delete the row and add a **change log** entry.
4. Prefer **directory or route prefixes** over listing every file—this doc should stay scannable.
