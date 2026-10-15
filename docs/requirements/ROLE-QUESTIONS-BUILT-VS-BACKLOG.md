# Roles, “who asks what,” and build status

**Purpose:** Map each stakeholder to what is **in production** vs what is **missing or partial**.  
**Detail lives in:** [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md), [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md), [BACKEND_FRONTEND_AUDIT.md](../BACKEND_FRONTEND_AUDIT.md).  
**Last updated:** 2026-04-24

**How to read a block**

- **In prod** = you can use it in a normal flow.
- **Gaps** = not built, half-built, or API only (no UI).
- **(Part)** = some of it is there, some is not.

Roles come from `USER_ROLES` in `src/types/database.ts`.

---

## A. People who log in (in-product)

### Super admin

- **Cares about:** who is on the platform, flags, costs, support, abuse.
- **In prod:** admin users/orgs, feature flags, plan limits, cost views, agents.
- **Gaps:** MFA for privileged accounts. Some routes have no button in the UI. See the backend/frontend **audit** link above.

### Company admin

- **Cares about:** org setup, who sees what, SSO, webhooks, privacy, money.
- **In prod:** company settings, permissions, integrations, outbound webhooks, privacy, billing, approvals list.
- **Gaps:** configurable multi-step approvals with SLAs. HRIS beyond “connection test.” SSO/SCIM as full enterprise.

### Recruiter / TA

- **Cares about:** open roles, post jobs, screen, pipeline speed, handoffs.
- **In prod:** jobs, pipeline, candidates, applications, saved searches, hiring requests, per-job **knockout** questions, **screening answers** on the application, FitScore, core analytics.
- **Gaps:** job-board health UX. Deduplication **merge** UI. Bulk pipeline moves in the **UI** (API exists). Unlock and notes: **API exists, UI not wired** — audit.

### Sourcer

- **Cares about:** inbound quality, where jobs post, duplicates. Often same login as **Recruiter** in the app.
- **In prod:** distribution stack, public jobs, FitScore, agents.
- **Gaps:** a clear “board status / retries” screen. Optional Chrome-style sourcing (not a focus unless you ship it).

### Hiring manager

- **Cares about:** my reqs, who to meet, sign-offs on plan and offer.
- **In prod:** `my-jobs`, HM sign-off on offer, hiring-request involvement, interview booking.
- **Gaps:** long approval **chains** (not just a few steps). Full **panel** interview rules. Internal job post “manager must approve before apply” if the product needs it.

### Interviewer

- **Cares about:** my schedule, prep, light feedback, least PII exposure.
- **In prod:** interviews area, book/reschedule APIs, interviewer list API.
- **Gaps:** reliable **video** flow. **Self-scheduling** for the candidate in every case. “Everyone must submit feedback” rules.

### Finance

- **Cares about:** budget, bands, approve before offer goes out, accruals.
- **In prod:** finance on offers, comp bands, CTC math, offer finance settings.
- **Gaps:** counter offer as a **versioned** flow with re-approval. CPH the way **finance** models cost (not only a dashboard number).

### Agency / RPO

- **Cares about:** many reqs, bulk work, client boundaries, fees.
- **In prod:** agency area, pipeline bulk, bulk profile upload.
- **Gaps:** rescore/backfill as a polished product. Same approval gaps as the employer side for big brands.

### Employee (referral / IJP)

- **Cares about:** what I can share, will I get paid, internal rules.
- **In prod:** referral flows, **(Part)** campaigns, job visibility flags, confidential apply.
- **Gaps:** a real **internal job catalog** and eligibility rules. Payroll file for bonuses. campaign scope vs PRD.

### Candidate (pro or free)

- **Cares about:** fair process, where I stand, self-serve, signing, my data.
- **In prod:** apply path, my applications, screening questions on apply, offer view/sign, assessments, profile.
- **Gaps:** a **page** for job preferences (API is there). NPS/survey. Chatbot = later.

---

## B. Stakeholders without a dedicated dashboard

### Legal / compliance

- **Cares about:** one trace from req to offer, EEO, retention, exports for disputes.
- **In prod:** erasure path, privacy jobs, EEO “readiness” style hooks, some audit.
- **Gaps:** a **full** audit export (every state change). full federal EEO if you sell to that market.

### IT / security

- **Cares about:** SSO, SCIM, signed webhooks, data isolation, incident playbooks.
- **In prod:** RBAC, RLS, CSRF, rate limits, HMAC webhooks, partial SSO/SCIM.
- **Gaps:** enterprise runbooks, webhook **DLQ and replay**, retention proof at table level.

### Payroll / HRIS

- **Cares about:** new hire in HRIS, referral bonuses in the pay file, plan vs real headcount.
- **In prod:** payout ledger, headcount hooks, “validate” HRIS connection.
- **Gaps:** ongoing **sync** of people and jobs. “Referral line on pay run” automation.

### DEI

- **Cares about:** consent, self-ID, report without skewing the process.
- **In prod:** only partial or readiness.
- **Gaps:** self-ID, reporting, legal sign-off on questions and rollups.

### Executive

- **Cares about:** cost per hire, time to fill, source quality.
- **In prod:** funnel, exports, some cost and dwell metrics **(Part)**.
- **Gaps:** one agreed **source-quality** and **CPH** model. “AI predicts X” = separate decision.

### Vendors (job boards, BGV, e-sign)

- **Cares about:** keys, webhooks, no double pay, idempotency.
- **In prod:** Stripe, WhatsApp, **(Part)** SpringVerify, in-product signing.
- **Gaps:** a big third-party e-sign (only if you sell that). BGV at “Checkr class” (optional). board-specific hardening.

---

## C. By product area (shorter than per-person)

1. **Identity and access** — In prod: auth, RBAC, per-role home. Gaps: SSO/SCIM depth, MFA for admins.

2. **Requisitions and approvals** — In prod: hiring requests, token actions, company approvals hub. Gaps: full configurable chains and SLAs.

3. **Jobs and apply** — In prod: jobs, public apply, feed, parse, knockout Qs, stored answers. Gaps: IJP, manager-gate, distribution health, unified email inbox (PRD).

4. **Pipeline and people** — In prod: stages, API bulk, notes API, candidate detail, FitScore. Gaps: dedup **merge** UI, unlock in UI, bulk in UI.

5. **Interviews** — In prod: book, reschedule, interviewer API. Gaps: video, self-serve schedule, panel rules.

6. **Offers** — In prod: draft, finance, HM, bands, native sign, recall, some PDF. Gaps: counter with versioning, merge-field process. Optional third-party sign.

7. **Referrals** — In prod: program, links, ledger. Gaps: payroll, campaigns, identity model cleanup.

8. **Integrations** — In prod: webhooks, OpenAPI, HMAC out, test HRIS. Gaps: HRIS **sync**, hire-to-LMS, outbound DLQ.

9. **Analytics** — In prod: funnel, exports, admin cost. Gaps: DEI depth, **source** truth, CPH the finance way.

10. **Compliance** — In prod: erasure, some readiness. Gaps: end-to-end audit pack, EEO go/no-go.

---

## Maintenance and links

- Update with [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) and [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) when you ship.
- Also see [FEATURE-BACKLOGS-MASTER.md](./FEATURE-BACKLOGS-MASTER.md), [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md), [PRODUCT-POLISH-BACKLOG.md](./PRODUCT-POLISH-BACKLOG.md).
