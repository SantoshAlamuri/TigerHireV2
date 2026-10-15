# ATS partial gaps — epic specifications

**Purpose:** One page per **epic** from the internal “Close ATS partial gaps” delivery plan: scope, current code, deliverables, exit criteria, and key files. Use for sprint planning and handoff.

**Master backlog rows:** [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md)

**Last updated:** 2026-04-24

---

## E-platform — Configurable workflow, SLA, domain audit, exports

**Goal:** Unblock multi-step approvals (requisition, IJP, offers) and compliance reporting with a **DB-driven workflow** (stages, sequential/parallel approvers), **SLA/escalation**, and **append-only audit** with **export** for legal.

**Current state (pointers):**

- Hiring requests: [`src/app/api/hiring-requests/`](../../src/app/api/hiring-requests/), [`src/lib/validations/hiring-requests.ts`](../../src/lib/validations/hiring-requests.ts)
- Approvals (tokens): [`src/app/api/approvals/`](../../src/app/api/approvals/), company UI: [`src/app/(dashboard)/company/approvals/`](<../../src/app/(dashboard)/company/approvals/>)
- Offer finance / HM: [`src/app/api/offers/`](../../src/app/api/offers/)
- Workflow SLA cron: [`src/app/api/cron/workflow-sla/`](../../src/app/api/cron/workflow-sla/)
- BRD/PRD gap (historical): [GAP-ANALYSIS-TigerHire-vs-BRD-PRD-and-implementation-plan.md](./GAP-ANALYSIS-TigerHire-vs-BRD-PRD-and-implementation-plan.md)

**Deliverables:**

1. Workflow definition model (stages, approver roles/users, parallel groups).
2. Emit audit event on every transition; export CSV (and PDF if required) for a request/offer id.
3. SLA rules (e.g. 50/90% reminders) and escalation targets; integrate with existing cron.

**Exit criteria:**

- At least one **requisition** and one **offer** path uses the shared engine end-to-end in staging.
- Sample **audit export** accepted by a security/compliance review dry run.

**Suggested DRI:** Platform / backend (workflow + DB).

---

## E-webhooks — Outbound customer webhooks (product-grade)

**Goal:** Enterprise **outbound** webhooks (not only inbound vendor webhooks): signed payloads, retries, org-configured endpoints, dead-letter handling.

**Current state (2026-04-23):**

- **MVP shipped:** HMAC-SHA256 delivery via Inngest fanout, org CRUD at [`/api/settings/org/outbound-webhooks`](../../src/app/api/settings/org/outbound-webhooks/route.ts), table `organisation_outbound_webhooks`, [`src/lib/webhooks/organisation-outbound-delivery.ts`](../../src/lib/webhooks/organisation-outbound-delivery.ts), [`webhookProcess`](../../src/inngest/functions.ts). Triggers: `application.submitted`, `offer.candidate_responded`, `offer.signed` (from applications POST, offer response handler, public native sign).
- Inbound: Stripe, WhatsApp, SpringVerify under [`src/app/api/webhooks/`](../../src/app/api/webhooks/).
- OpenAPI: [README.md](../../README.md) (`/api/openapi` when running).

**Remaining (backlog):**

1. Per-delivery persistence / DLQ / admin replay UI.
2. Optional: first-party company settings page (API-only today).
3. Security hardening: optional IP allowlist, signed replay window docs for customers.

**Exit criteria (pilot):**

- Customer receives test events on their endpoint with verifiable `X-TigerHire-Signature` (see [API.md](../API.md)).

**Suggested DRI:** Platform / integrations.

---

## E-req-offer — Requisition depth, JD governance, offer versioning

**Goal:** Close P0 rows for **headcount plan validation**, **JD template governance**, **counter-offer + versioning**, and **multi-approver** offer chains (ties to E-platform).

**Current state:**

- `headcountPlanLineId` hook: [`src/lib/validations/hiring-requests.ts`](../../src/lib/validations/hiring-requests.ts)
- Clone requisition: [`src/app/api/hiring-requests/[id]/clone/route.ts`](../../src/app/api/hiring-requests/%5Bid%5D/clone/route.ts)
- Offers, PDF, signing: [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §10

**Deliverables:**

1. Plan line resolution and validation (internal table or HRIS id).
2. JD template library: version, approval, and FitScore alignment.
3. Offer: immutable versions on send; **negotiation** creates new version and re-enters approval; no illegal shortcuts.

**Exit criteria:**

- Product sign-off on requisition → draft job → offer traceability for one pilot customer schema.
- Contract tests for offer state machine.

**Suggested DRI:** Product engineer (core hiring domain).

---

## E-ijp-referral — IJP, referrals, payroll, campaigns

**Goal:** **IJP** beyond internal listing flags; **referral** payroll path; **campaigns** to PRD; **referral spec merge** completion.

**Current state:**

- Visibility: [`src/components/dashboard/JobListingVisibilityFields.tsx`](../../src/components/dashboard/JobListingVisibilityFields.tsx), [`src/app/api/refer/jobs/open/route.ts`](../../src/app/api/refer/jobs/open/route.ts)
- Confidential apply: [`src/lib/validations/applications.ts`](../../src/lib/validations/applications.ts)
- Spec: [REFERRAL_INTEGRATION_SPEC.md](../REFERRAL_INTEGRATION_SPEC.md)
- Payout: `payout_ledger`, [`src/lib/referrers/`](../../src/lib/referrers/), [`src/lib/agents/payout-trigger.ts`](../../src/lib/agents/payout-trigger.ts)
- Campaigns UI: [`src/app/(dashboard)/company/referrals/campaigns/page.tsx`](<../../src/app/(dashboard)/company/referrals/campaigns/page.tsx>)

**Deliverables:**

1. IJP: employee job catalog + eligibility rules (or documented MVP cut).
2. Payout: export format + HRIS connector or file handoff; tenure milestones if in scope.
3. Complete spec merge (remove legacy referrer session paths per spec).
4. Campaigns: budget, UTM, eligibility, time box per PRD.

**Exit criteria:**

- One payroll partner path tested in staging; IJP v1 UAT script.

**Suggested DRI:** Product + referrals pod.

---

## E-source-screen — Sourcing, knockout Qs, assessments, dedup, FitScore

**Goal:** Harden **job board distribution**; add **per-job knockout questions**; **deep assessment** integration; **candidate merge** UI; **org-tunable** FitScore explainability.

**Current state:**

- Distribution: [`src/lib/distribution/`](../../src/lib/distribution/)
- **Knockout (yes/no) per job (MVP shipped):** [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §4–5 — `src/lib/screening/`, `src/app/api/jobs/[id]/screening-questions/`, public + candidate apply; migration `20260424090000_job_screening_questions`.
- Apply: [`src/lib/validations/applications.ts`](../../src/lib/validations/applications.ts) (optional `screeningAnswers` when job has active questions)
- Dedup: [`src/lib/agents/candidate-dedup.ts`](../../src/lib/agents/candidate-dedup.ts)
- Assessments: [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §12
- FitScore: [`src/lib/fitscore/`](../../src/lib/fitscore/)

**Deliverables:**

1. Distribution: per-board health, user-visible errors, retries.
2. Screening: per-job yes/no + `application_screening_answers`; `GET /api/applications/[id].screeningAnswers` + candidate detail (inventory §4–5). **Next:** exports/funnel, email + bulk-apply parity, post-apply stage rules if required.
3. Dedup: merge UI + audit + override.
4. FitScore: export rationale + org weights (feature-flagged if needed).

**Exit criteria:**

- Happy path + failure path E2E for at least one board; one knockout flow in staging.

**Suggested DRI:** Recruiter experience + ML/FitScore.

---

## E-int-analytics — Interviews, video, self-schedule, NPS, DEI, CPH

**Goal:** **Video** and **self-schedule** to product bar; **chatbot/NPS** (if P1 for launch); **DEI** self-ID and reporting; **source quality** and **CPH** depth.

**Current state:**

- Interviews: [`src/app/api/jobs/[id]/interviews/book/route.ts`](../../src/app/api/jobs/%5Bid%5D/interviews/book/route.ts)
- Help: [interview-scheduling-flow.md](../help/interview-scheduling-flow.md)
- Gaps: [PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md)
- Analytics: [`src/app/api/analytics/`](../../src/app/api/analytics/) (`cost_per_hire`, funnels)
- EEO readiness: [`src/app/api/compliance/eeo-ofccp-readiness/route.ts`](../../src/app/api/compliance/eeo-ofccp-readiness/route.ts)

**Deliverables:**

1. Video: policy + stable links for top providers.
2. Self-schedule: candidate flow where required.
3. DEI: self-ID, consent, dashboards (if product commits).
4. CPH: line-item costs or explicit exclusions doc.

**Exit criteria:**

- Interview UAT script passes for pilot; analytics definitions signed off with Finance.

**Suggested DRI:** Product + data.

---

## E-integrations — SSO, SCIM, HRIS sync, hire handoff, LMS

**Goal:** **Production** enterprise identity (SSO, SCIM group mapping as needed); **HRIS** sync (not just validate); **hire event** to HRIS and **LMS** enrollment; customer webhooks link to E-webhooks.

**Current state:**

- Runtime doc: [sso-and-hrms-runtime-setup.md](../integrations/sso-and-hrms-runtime-setup.md)
- SCIM: [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §2, [`src/app/api/scim/`](../../src/app/api/scim/)
- Inventory [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §16–20

**Deliverables:**

1. SSO/SCIM hardening: runbook, test matrix per IdP.
2. HRIS: employee + headcount sync, reconciliation report.
3. `hired` event worker: idempotent upsert to HRIS; optional LMS API.
4. Document dependency on E-webhooks for customer-owned endpoints.

**Exit criteria:**

- One pilot: nightly sync + one hire handoff in staging with reconciliation log.

**Suggested DRI:** Integrations engineer.

---

## Epic → plan to-dos (traceability)

| Plan todo id              | Epics in this file                                  |
| ------------------------- | --------------------------------------------------- |
| `platform-workflow-audit` | E-platform (primary)                                |
| `webhooks-product`        | E-webhooks                                          |
| `requisition-offers`      | E-req-offer                                         |
| `ijp-referrals`           | E-ijp-referral                                      |
| `sourcing-screening`      | E-source-screen                                     |
| `interview-exp-analytics` | E-int-analytics                                     |
| `integrations`            | E-integrations (+ E-webhooks for customer webhooks) |
