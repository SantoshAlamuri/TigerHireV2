# Feature backlogs: partial, pending, and activities

**Purpose:** One-page index of where **partial**, **pending** (not started), and **engineering activities** are tracked, so you do not have to open multiple backlogs to orient. For authoritative tables and exit criteria, follow the links below.

**Last updated:** 2026-04-24 (sync with [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) when you change scope).

---

## Canonical sources (read these for detail)

| Document                                                                   | What it contains                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md)               | **Primary** “partial ATS” table: P0–P2, epic, gap, exit criteria (11 sections)                                                                      |
| [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md)                             | Per-epic scope, files, deliverables, exit criteria (E-platform, E-webhooks, E-req-offer, etc.)                                                      |
| [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md) | Sequenced A/B/C items with **Implementation status** (Not started / Partial / Shipped) + New vs Edit                                                |
| [PRODUCT-POLISH-BACKLOG.md](./PRODUCT-POLISH-BACKLOG.md)                   | UX/complete-first polish (P0–P2): shells, empty/error, honest copy, loading                                                                         |
| [../PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md)                   | Broader **role-based** gap matrix (candidate/recruiter/admin/AI); overlaps ATS backlog; some rows may be older than April 2026 code                 |
| [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md)               | **What actually ships** in the repo; many rows marked **Partial** (single source of truth for implementation)                                       |
| [ROLE-QUESTIONS-BUILT-VS-BACKLOG.md](./ROLE-QUESTIONS-BUILT-VS-BACKLOG.md) | **Who asks what** by role (in-product + legal/IT/payroll), behaviors, and **built vs partial vs not in repo** (pointers to inventory + ATS partial) |
| [SPRINT-PLAN-BACKLOG-TO-DONE.md](./SPRINT-PLAN-BACKLOG-TO-DONE.md)         | **Sprint-by-sprint** program: pending → complete, Sprint 0–6+                                                                                       |
| [GAP-BACKLOG-github-issues.md](./GAP-BACKLOG-github-issues.md)             | Suggested GitHub issue text per gap row                                                                                                             |

---

## 1. Product polish backlog (complete-first, not deep ATS)

From [PRODUCT-POLISH-BACKLOG.md](./PRODUCT-POLISH-BACKLOG.md):

- **P0 — Surface and trust:** DashboardShell consistency; empty/error/retry on key lists; honest copy for requisitions → jobs, apply, screening, approvals; avoid “empty” flash (skeletons).
- **P1 — Coherence:** Primary paths (apply → stage → notifications); recruiter vs HM visibility; settings aligned with API reality.
- **P2 — Depth:** Funnel, exports, bulk, vendor integrations (cross-ref ATS partial + inventory).

**Guiding rule:** Do not ship UI that promises behavior the system cannot perform.

---

## 2. ATS partial gaps (by product area)

From [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) — each line is a **partial** capability with a remaining gap.

- **§1 Requisition and approval** — Headcount/budget vs plan (deeper HRIS/finance); multi-level req approval (configurable chain + SLAs); JD/templates governance (approval-before-use, library UX).
- **§2 IJP** — Internal job board; eligibility rules; optional internal pipeline; succession/career path; manager approval to apply; confidential apply (visibility/RLS).
- **§3 Referrals** — Bonus → payroll; referral identity merge; campaigns (eligibility, budgets, UTM, windows).
- **§4 Sourcing** — Multi-channel posting (reliability, status dashboard); passive/Chrome (P2 or won’t do); AI matching explainability + org weights.
- **§5 Screening and selection** — Knockout/screening **v3:** funnel/exports, email + bulk-apply parity, post-apply stage rules; assessment vendor depth; panel feedback consolidation; duplicate merge UI.
- **§6 Interviews** — Video E2E (stable links, Zoom/Daily as needed); self-schedule for candidates everywhere product requires it.
- **§7 Offers** — Multi-stage approval (workflow); counter/negotiation + versioning; offer letter/PDF (merge fields, legal, locale, immutable version); comp benchmarking; equity/variable.
- **§8 Candidate experience** — Chatbot; NPS; bulk comms with compliance.
- **§9 Analytics** — DEI/self-ID + reports; source quality normalization; predictive (or defer); cost-per-hire (full model).
- **§10 Compliance** — GDPR/retention proofs; EEO/OFCCP; hiring/offer audit 100% + exporter.
- **§11 Integrations** — SSO/SCIM hardening; HRIS sync beyond validate-only; hire → HRIS/LMS; webhooks (DLQ/replay UI, delivery log, settings UI).

**Epic IDs** for cross-reference: E-platform, E-webhooks, E-req-offer, E-ijp-referral, E-source-screen, E-int-analytics, E-integrations (see the same file).

---

## 3. Ordered gap backlog — status snapshot (A1–C7)

From the **Implementation status** table in [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md).

**Not started:** A1, A8, A11, A12, A13, B4, B5, B10, B11, B12, B13, B14, B15, B16, C3, C5, C7 (configurable multi-tier engine = C3).

**Partial:** A3, A4, A5, A6, A7, A9, A10, A14, A15, A16, A17, B1, B2, B3, B6, B8, B9, C1, C2, C4, C6.

**Shipped in this table:** A2, B7 (see that doc for Inngest reminders, comp bands, and notes).

**Tiered gap themes:**

- **Tier A:** Time-in-stage/TAT export; re-apply/cooling-off; application analytics; boolean/advanced search; saved lists; culture-fit dimensions; i18n; portfolio; skills quiz; market benchmarking; chatbot FAQ; company comparison; email deep-link approvals; OTP public offer; counter-offer semantics fix; BGV post-accept hook.
- **Tier B:** E-sign; offer PDF/versioning; BGV vendor; LinkedIn; ATS/HRMS sync; headcount for finance; comp bands/exception; requisition BRD parity; multi-tier offer approval; talent pool/nurture; onboarding; custom reports; DEI; skills ontology; async video; mobile apps.
- **Tier C:** Immutable audit completeness; SLA/escalation engine; configurable multi-tier workflow; orchestrator vs user automation; enterprise dashboards; delegation; localized offer templates.

**Out of scope (explicit in the ordered doc):** e.g. Zoom/Daily, WhatsApp, SCIM as “narrative-only” gaps — **verify in code** before treating as product gaps.

---

## 4. Epic-level “remaining” example (E-webhooks)

[ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md) documents per-epic **Remaining** lists — e.g. **E-webhooks:** per-delivery persistence / DLQ / admin replay; optional first-party settings UI; security hardening (IP allowlist, signed replay docs). Other epics have analogous sections.

---

## 5. Ongoing engineering / audit activities (from gap doc)

The “Latest rerun (2026-04-18)” block in [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md) records **active drag** (re-run `npm run typecheck` and the rate tool to see current state):

- `npm run rate` → 94/100 (at time of that note); no oversize files over 1000 lines in noted scope.
- **Typecheck** was called out for: `src/app/api/admin/users/route.ts`, `analytics/export`, `hiring-requests`, `messages`, `organisations`, `referral-campaigns`. Re-verify on each audit; the repo was **clean** under `npm run typecheck` as of 2026-04-24 (see [SPRINT-PLAN-BACKLOG-TO-DONE.md](./SPRINT-PLAN-BACKLOG-TO-DONE.md) Sprint 0 verification).

These are **engineering health** items, not product features, but they are pending activities tied to backlog hygiene.

---

## 6. How the big gap matrix fits in

[PRODUCT_FEATURE_GAPS.md](../PRODUCT_FEATURE_GAPS.md) is a **wide** product analysis (missing vs partial by role, integrations, security, roadmap phases). Use it for narrative and prioritization; for **what to build next in-repo**, prefer **FEATURE-INVENTORY-LIVING** + **ATS-PARTIAL-GAPS** + **GAP-BACKLOG-ordered** to avoid double-counting or outdated checkboxes.

---

## Suggested use

| Goal                              | Open                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sprint planning / partial work    | [ATS-PARTIAL-GAPS-BACKLOG.md](./ATS-PARTIAL-GAPS-BACKLOG.md) + [ATS-EPICS-BACKLOG.md](./ATS-EPICS-BACKLOG.md) |
| Sequencing and New vs Edit        | [GAP-BACKLOG-ordered-new-vs-edit.md](./GAP-BACKLOG-ordered-new-vs-edit.md)                                    |
| UX “complete” before integrations | [PRODUCT-POLISH-BACKLOG.md](./PRODUCT-POLISH-BACKLOG.md)                                                      |
| Truth in code                     | [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md)                                                  |

When you **close a partial row**, update the ATS partial backlog and [FEATURE-INVENTORY-LIVING.md](./FEATURE-INVENTORY-LIVING.md) in the same change, per the partial gaps doc.
