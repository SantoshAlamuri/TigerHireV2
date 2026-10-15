# TigerHire — ATS “partial” gaps backlog

**Purpose:** When a capability is **partial** in TigerHire, some product path exists in code or docs, but a defined slice of **scope, config, or policy** is still missing. This document lists those gaps against a **classic ATS checklist**, with **priority**, **owning epic**, and **exit criteria** so work can be sequenced without relying on chat history.

**Canonical implementation status:** [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) (what actually ships).

**Product / compliance context:** [PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md), [GAP-ANALYSIS-TigerHire-vs-BRD-PRD-and-implementation-plan.md](./GAP-ANALYSIS-TigerHire-vs-BRD-PRD-and-implementation-plan.md) (BRD doc may predate some offer/signing work—reconcile with code when scoping).

**Epic specifications (scope, files, exit criteria):** [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md)

**Last updated:** 2026-04-24

---

## How to use

1. Find the row for the ATS area you care about.
2. Check **P** (priority) and **Epic** (where detailed scope lives).
3. When a row is **done**, update this table and the [living feature inventory](./FEATURE-INVENTORY-LIVING.md) in the same PR.

**Priority legend**

| P   | Meaning                                     |
| --- | ------------------------------------------- |
| P0  | Revenue, compliance, or security risk       |
| P1  | Enterprise parity or major UX gap           |
| P2  | Nice-to-have, build-vs-buy, or long horizon |

**Epic legend** — see [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md)

| Epic id         | Name                                      |
| --------------- | ----------------------------------------- |
| E-platform      | Platform workflow, SLA, audit, exports    |
| E-webhooks      | Outbound customer webhooks                |
| E-req-offer     | Requisition, JD governance, offers        |
| E-ijp-referral  | IJP, referrals, campaigns                 |
| E-source-screen | Sourcing, screening, dedup, FitScore tune |
| E-int-analytics | Interviews, candidate exp, DEI, analytics |
| E-integrations  | SSO, SCIM, HRIS, LMS, handoff             |

---

## 1. Job requisition and approval

| Partial area               | P   | Epic        | Current implementation (pointers)                                                                                                                                                                                                                                    | Gap to close                                                                                          | Exit criteria (done means)                            |
| -------------------------- | --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Headcount / budget vs plan | P1  | E-req-offer | **Shipped (core):** [headcount-plan-validation](../../src/lib/hiring-requests/headcount-plan-validation.ts), `headcount_plans` / `headcount_plan_lines`, [headcount-plans API](../../src/app/api/headcount-plans/route.ts), enforced on hiring-request create/update | Deeper: auto-sync from HRIS, finance reporting by plan line, exception workflows                      | HRIS sync or export where required by customer        |
| Multi-level req approval   | P0  | E-platform  | Hiring requests, tokenized approvals, `company/approvals` — [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §9                                                                                                                                                    | Configurable chain (e.g. Manager → HR → Finance) with stage SLAs and escalation                       | Config UI or DB; approvals audited; SLA breach events |
| JD / templates             | P1  | E-req-offer | **Partial (v1 shipped):** `requisition_jd_templates` + `template_id` on hiring requests (see migration `requisition_approval_100_core`); JD parse, FitScore JD base                                                                                                  | Governance UX: approval-before-use, richer library search, keyword packs per family as a product pass | PRD acceptance for template governance                |

---

## 2. Internal job posting (IJP)

| Partial area               | P   | Epic           | Current implementation (pointers)                                                                                                                                                                                      | Gap to close                                                                                 | Exit criteria (done means)                                    |
| -------------------------- | --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Internal “job board”       | P1  | E-ijp-referral | `list_on_public_job_board` / `list_for_internal_referrals`, [JobListingVisibilityFields](../../src/components/dashboard/JobListingVisibilityFields.tsx), [refer/jobs/open](../../src/app/api/refer/jobs/open/route.ts) | Dedicated IJP home (employee catalog + apply rules) if Workday-style IJP is required         | Employee-only listing + apply path distinct from public refer |
| Eligibility (tenure, etc)  | P1  | E-ijp-referral | Not modeled as IJP rules                                                                                                                                                                                               | Rule engine tied to employee profile (HRIS or org fields)                                    | Rules on see/apply; admin UI                                  |
| Separate internal pipeline | P2  | E-ijp-referral | One pipeline per job, source tags                                                                                                                                                                                      | Optional parallel internal track (stages, reporting) if product requires isolation           | Design doc + data model; reports                              |
| Succession / career path   | P2  | E-ijp-referral | None                                                                                                                                                                                                                   | Talent bench, role graph, or integration                                                     | Out of scope documented OR v1 module                          |
| Manager approval to apply  | P1  | E-platform     | N/A as IJP gate                                                                                                                                                                                                        | Workflow: request → manager OK → application created                                         | Tied to E-platform workflow; audit                            |
| Confidential apply         | P1  | E-ijp-referral | `confidentialApply` in [applications validation](../../src/lib/validations/applications.ts)                                                                                                                            | Visibility rules and org policy (manager vs HM vs recruiter; internal vs external semantics) | RLS/UX matrix documented; test cases                          |

---

## 3. Referrals

| Partial area             | P   | Epic           | Current implementation (pointers)                                                                         | Gap to close                                                                                 | Exit criteria (done means)                  |
| ------------------------ | --- | -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Bonus / reward → payroll | P0  | E-ijp-referral | Payout ledger, exports — [REFERRAL_INTEGRATION_SPEC.md](../REFERRAL_INTEGRATION_SPEC.md), `payout_ledger` | Payroll file format, HRIS pay run, tenure milestone automation if “payroll trigger” required | File spec + at least one HRIS test path     |
| Referral identity merge  | P1  | E-ijp-referral | [REFERRAL_INTEGRATION_SPEC.md](../REFERRAL_INTEGRATION_SPEC.md)                                           | Finish unifying referrer session vs Supabase per spec checklist                              | No duplicate legacy paths; checklist closed |
| Campaigns                | P1  | E-ijp-referral | `src/app/(dashboard)/company/referrals/campaigns/page.tsx`                                                | Match PRD: eligibility, budgets, UTM, time windows                                           | PRD acceptance row + E2E                    |

---

## 4. Candidate sourcing

| Partial area           | P   | Epic            | Current implementation (pointers)                                             | Gap to close                                                        | Exit criteria (done means)         |
| ---------------------- | --- | --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Multi-channel posting  | P0  | E-source-screen | [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §3, `src/lib/distribution` | All target boards with reliability, per-board post status, error UX | Status dashboard; retry policy     |
| Passive / Chrome ext   | P2  | E-source-screen | [PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md)                         | Extension or API sourcing workflow                                  | Ship or “won’t do” in doc          |
| AI matching enterprise | P1  | E-source-screen | FitScore [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §5                | Explainability, customer-tunable org weights for auto-rank          | Admin tuning + export of rationale |

---

## 5. Screening and selection

| Partial area                  | P   | Epic            | Current implementation (pointers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Gap to close                                                                          | Exit criteria (done means)                                            |
| ----------------------------- | --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Knockout / screening (yes/no) | P1  | E-source-screen | **Shipped (MVP + v2 read):** [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) §4–5; **recruiter:** `GET /api/applications/[id]` returns `screeningAnswers` + [candidate detail Hireability](<../../src/app/(dashboard)/recruit/candidates/[id]/page.tsx>) block; [fetch-application-screening-display](../../src/lib/screening/fetch-application-screening-display.ts). Plus: per-job [JobScreeningPanel](<../../src/app/(dashboard)/recruit/jobs/[id]/components/JobScreeningPanel.tsx>), public + authenticated apply, [WhatsApp](../../src/lib/whatsapp/application-bridge.ts) | v3: funnel/exports, email + bulk-apply intake parity, optional post-apply stage rules | **MVP + stored-answer read** in talent UI; remaining gaps in column 5 |
| Assessment depth              | P1  | E-source-screen | Assessments, share tokens [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Vendor deep integration (HackerRank-class): score sync, pass/fail → stage             | At least one vendor E2E                                               |
| Panel feedback                | P1  | E-int-analytics | [jobs/.../feedback](../../src/app/api/jobs), interview feedback cron                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Multi-reviewer gate + consolidation, “all in before advance”                          | Configurable policy                                                   |
| Duplicate handling            | P1  | E-source-screen | [candidate-dedup](../../src/lib/agents/candidate-dedup.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Merge UI, audit, recruiter override rules                                             | Merge flow + audit events                                             |

---

## 6. Interview management

| Partial area  | P   | Epic            | Current implementation (pointers)                                                                                           | Gap to close                                                                | Exit criteria (done means) |
| ------------- | --- | --------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| Video E2E     | P1  | E-int-analytics | [interviews/book](../../src/app/api/jobs/[id]/interviews/book/route.ts), [PRODUCT_FEATURE_GAPS](../PRODUCT_FEATURE_GAPS.md) | Stable meeting links, policy, host guidance; Zoom/Daily as required         | UAT on top customers       |
| Self-schedule | P1  | E-int-analytics | [interview-scheduling-flow.md](../help/interview-scheduling-flow.md)                                                        | Candidate self-pick everywhere required by product, not only recruiter book | Self-serve + notifications |

---

## 7. Offer rollout

| Partial area          | P   | Epic        | Current implementation (pointers)                                    | Gap to close                                                        | Exit criteria (done means)      |
| --------------------- | --- | ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Multi-stage approval  | P0  | E-platform  | Finance + HM, [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §10 | Comp/Legal/CHRO-style parallel/sequential chains (workflow engine)  | Chains in config; audit         |
| Counter / negotiation | P0  | E-req-offer | [offers API](../../src/app/api/offers)                               | Versioning + re-approval per counter; no stage shortcuting          | State machine + tests           |
| Offer letter / PDF    | P0  | E-req-offer | [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §10 (partial)     | All merge fields, legal sign-off, locale, immutable version on send | Checklist; hash/version storage |
| Comp benchmarking     | P2  | E-req-offer | Compensation bands in repo                                           | External market source (e.g. Radford) or explicit out-of-scope      | Doc + integration or defer      |
| Equity / variable     | P2  | E-req-offer | CTC JSON                                                             | Engine for equity/bonus if in scope                                 | Or document limitation          |

---

## 8. Candidate experience

| Partial area  | P   | Epic            | Current implementation (pointers)                     | Gap to close                                                | Exit criteria (done means)  |
| ------------- | --- | --------------- | ----------------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Chatbot       | P2  | E-int-analytics | [PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md) | Bot + KB + escalation to human                              | v1 in prod with guardrails  |
| Candidate NPS | P2  | E-int-analytics | None found                                            | Post-stage or post-hire survey + analytics                  | Data in analytics           |
| Bulk comms    | P1  | E-int-analytics | Email, templates, Resend                              | Bulk with compliance: unsubscribe, purpose, campaign object | Comms object + policy tests |

---

## 9. Analytics

| Partial area    | P   | Epic            | Current implementation (pointers)                                                                                | Gap to close                                                 | Exit criteria (done means) |
| --------------- | --- | --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| DEI / diversity | P0  | E-int-analytics | [eeo-ofccp-readiness](../../src/app/api/compliance/eeo-ofccp-readiness/route.ts) (readiness, not full reporting) | Optional self-ID + consent + reports; EEO export if in scope | PRD + legal sign-off       |
| Source quality  | P1  | E-int-analytics | Funnel, export [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §13                                            | UTM, board ID, refer source normalization; quality-by-source | Data contract + dashboard  |
| Predictive      | P2  | E-int-analytics | Marketing copy in places                                                                                         | Real model + data quality; separate initiative               | Or defer explicitly        |
| Cost-per-hire   | P1  | E-int-analytics | [analytics cost_per_hire](../../src/app/api/analytics/route.ts)                                                  | Full cost model (fees, tools, time) for finance-grade CPH    | CPH doc + line items       |

---

## 10. Compliance and security

| Partial area       | P   | Epic            | Current implementation (pointers)                                                      | Gap to close                                                      | Exit criteria (done means) |
| ------------------ | --- | --------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| GDPR / retention   | P0  | E-platform      | [privacy/cron](../security/pii-retention-coverage.md), erasure                         | Per-table retention proofs, DPA-level evidence                    | Control matrix signed off  |
| EEO / OFCCP        | P0  | E-int-analytics | [integration-compliance-inventory.md](../security/integration-compliance-inventory.md) | Federal-style reports if US federal contractor market; else defer | Product decision in doc    |
| Hiring/offer audit | P0  | E-platform      | Partial events — see BRD gap doc, Phase 1 notes                                        | 100% state change coverage; CSV/PDF exporter for legal            | Sample export in audit     |

---

## 11. Integrations

| Partial area       | P   | Epic           | Current implementation (pointers)                                                                                                                                                                                                                                                          | Gap to close                                                                                         | Exit criteria (done means) |
| ------------------ | --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| SSO                | P0  | E-integrations | [FEATURE-INVENTORY](./FEATURE-INVENTORY-LIVING.md) §2, [sso-and-hrms-runtime-setup.md](../integrations/sso-and-hrms-runtime-setup.md)                                                                                                                                                      | IdP hardening, SCIM/group mapping, session policy for enterprise                                     | Runbook + customer pilot   |
| HRIS               | P0  | E-integrations | Validate flow for Keka/HiBob/Darwinbox/BambooHR/Workday in settings + phase-1 sync-run scaffold (`/api/settings/org/integrations/hris/sync`, persisted `hris_sync_runs`)                                                                                                                   | Implement operational sync: employees, headcount, requisitions, hire pushback, not just connectivity | Reconciliation report      |
| Hire → HRIS/LMS    | P0  | E-integrations | Pipeline `hired` + events                                                                                                                                                                                                                                                                  | Idempotent workers; LMS enroll API                                                                   | E2E hire → first system    |
| OpenAPI / webhooks | P1  | E-webhooks     | **Shipped:** [`/api/openapi`](../../README.md); HMAC [outbound webhooks API](../../src/app/api/settings/org/outbound-webhooks/route.ts); [Inngest fanout](../../src/inngest/functions.ts) (`webhookProcess`); events: `application.submitted`, `offer.candidate_responded`, `offer.signed` | Harden: DLQ/replay UI, per-endpoint delivery log, first-party settings UI (API works today)          | Sec review; customer pilot |

---

## Maintenance

- **Owners:** Product sets P labels; Eng assigns DRI per epic in [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md).
- **When shipping:** Update this file and [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) in the same change.
