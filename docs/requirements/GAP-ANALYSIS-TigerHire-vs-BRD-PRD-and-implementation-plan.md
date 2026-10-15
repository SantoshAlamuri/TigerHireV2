# Gap Analysis: TigerHire vs BRD/PRD (Hiring Approval & Offer Management)

**Purpose:** Map the requirements in [BRD-hiring-approval-offer-management-v1.0.md](./BRD-hiring-approval-offer-management-v1.0.md) and [PRD-hiring-approval-offer-management-v1.0.md](./PRD-hiring-approval-offer-management-v1.0.md) to what exists in the TigerHire repository today, and outline a phased implementation plan.

**Scope note:** This analysis reflects the codebase structure as of the document date. Line references may drift; prefer searching by file path.

---

## 1. Executive summary

TigerHire already ships **foundational pieces**: lightweight **hiring requests**, **job (JD) creation** (including AI-assisted generation from an approved request), **dual shortlist approval** (recruiter + hiring manager), a **finance role** with **offer creation → finance approval → send → candidate response**, **in-app notifications**, and **partial enterprise identity** (e.g. Azure OID, SCIM-related tables).

Large gaps remain versus the BRD/PRD: **no formal requisition ID or multi-stage requisition workflow**, **no SLA/escalation engine**, **no compensation band engine or exception routing**, **no immutable hiring/offer audit log** matching REQ-AUD/F-04, **no offer letter generation or e-sign**, **no OTP candidate offer portal**, **no email deep-link approvals**, and **no ATS/HRMS product integrations** (see also `docs/PRODUCT_FEATURE_GAPS.md`).

---

## 2. What is built (mapped to BRD/PRD themes)

| Theme                         | BRD / PRD expectation                              | TigerHire today                                                                                                                                                                         | Primary code / schema                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requisition intake**        | Full REQ form, REQ-ID, Draft → Submitted → …       | **Partial:** “Hiring request” with title, department, headcount, urgency, description, notes; status `pending` / `approved` / `converted` / `rejected` — not BRD field set or ID format | `supabase/schema/25_hiring_requests.sql`, `src/lib/validations/hiring-requests.ts`, `src/app/api/hiring-requests/*`, UI under `company/hiring-requests`, `recruit/hiring-requests` |
| **Req → JD**                  | Publish to ATS after approval                      | **Partial:** Approving a request can **auto-generate a draft job**                                                                                                                      | `src/app/api/hiring-requests/[id]/route.ts`                                                                                                                                        |
| **Shortlist / selection**     | Shortlist + interview tracking                     | **Partial:** Recruiter + HM must approve before interview scheduling                                                                                                                    | `supabase/schema/26_shortlist_approvals.sql`, `src/app/api/jobs/[id]/pipeline/approve/route.ts`                                                                                    |
| **Offer initiation**          | Structured comp fields, band validation            | **Partial:** Offer tied to `application_id`; `compensation_json` is flexible JSON; **no band validation**                                                                               | `src/lib/validations/offers.ts`, `src/app/api/offers/route.ts`, `offers` table in `supabase/migrations/20260321150000_offers_scim_assessments.sql`                                 |
| **Offer approval**            | Multi-stage (Comp, Finance, Legal, CHRO), parallel | **Partial:** **Single finance gate** (`pending_finance` → `approved`/`rejected`); `offer_approvals` records finance decisions only                                                      | `src/app/api/offers/[id]/finance/route.ts`, `offer_approvals`                                                                                                                      |
| **Offer dispatch & response** | Portal, OTP, no salary in email                    | **Partial:** Send moves to `sent`; notifies candidate to **log in**; response via authenticated API                                                                                     | `src/app/api/offers/[id]/send/route.ts`, `src/app/api/offers/[id]/response/route.ts`                                                                                               |
| **Finance / RBAC**            | Finance approver                                   | **Exists:** `finance` enterprise role, finance inbox pattern                                                                                                                            | `employee_roles` in `20260321150000_offers_scim_assessments.sql`, `src/app/(dashboard)/company/finance/page.tsx`                                                                   |
| **Notifications**             | < 60s, reminders, SLA                              | **Partial:** In-app (and email via notification service); **no workflow SLA timers** or SMS in product sense                                                                            | `src/lib/services/notifications` (usage in offers/hiring-requests routes)                                                                                                          |
| **Orchestrator checkpoints**  | Optional parallel to “human-in-the-loop” workflows | **Exists** for agent runs (not a full BRD workflow engine)                                                                                                                              | `src/lib/agents/orchestrator.ts`, `src/app/api/jobs/[id]/orchestrator/approve/route.ts`                                                                                            |
| **Audit (profiles)**          | Immutable hiring/offer audit                       | **Partial:** `user_audit_log` for profile lifecycle; **not** requisition/offer decision audit                                                                                           | `supabase/migrations/20260311110000_user_audit_log.sql`                                                                                                                            |

---

## 3. Gaps and risks (prioritized)

### P0 — Blocks BRD/PRD “MVP” claims for this module

| ID     | Gap                                                                                                                                      | Risk                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| G-P0-1 | No **immutable audit trail** for requisitions/offers (event type, prev/new state, IP, channel, document version)                         | Compliance / disputes (REQ-AUD-001–004, F-04) |
| G-P0-2 | No **configurable multi-tier workflow** + **SLA / escalation** (REQ-WF-001–004, F-02, F-03)                                              | TAT KPIs and bottleneck reduction unrealized  |
| G-P0-3 | No **compensation band** model or **exception workflow** (REQ-OF-002, F-06, F-14)                                                        | Policy/budget enforcement missing             |
| G-P0-4 | No **offer letter generation**, **versioning**, or **e-sign** (F-07, F-09, §6 NFR)                                                       | “Digital offer” and legal acceptance not met  |
| G-P0-5 | Candidate path is **logged-in user**, not **OTP portal**; salary exposure policy in notifications not systematically enforced (PRD §6.2) | Security/privacy expectation gap              |

### P1 — Important for enterprise rollout

| ID     | Gap                                                                                                   | Risk                                     |
| ------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| G-P1-1 | Requisition missing **REQ-HR-001** fields, **REQ-ID**, Draft/Submitted states                         | Cannot trace reqs to offers as specified |
| G-P1-2 | Offer workflow missing **Legal / Comp & Ben / CHRO** stages and **parallel** gates (REQ-OF-003, F-08) | Wrong approval topology                  |
| G-P1-3 | **Email deep-link** approvals with one-time tokens (F-12)                                             | Mobile/executive adoption (R-004)        |
| G-P1-4 | **Dashboards** for time-to-offer, stage TAT, traceability score (F-10, F-17, §7 KPIs)                 | No measurement loop                      |
| G-P1-5 | **ATS/HRMS** integrations (F-11)                                                                      | Manual sync, duplicate systems           |

### P2 — Enhancements

- Delegation / proxy (F-16), multi-language templates (F-18), BGV trigger (F-19), AI comp suggestions (F-20).
- **Counter-offer:** today `counter` maps offer status to `approved` in `response/route.ts` — likely **incorrect for product intent**; needs dedicated `counter` / revision workflow.

---

## 4. Implementation plan (phased)

Aligns loosely with PRD §9; durations assume one product/engineering stream — adjust for team size.

### Phase 0 — Design lock (2–4 weeks)

**Deliverables**

- ERD for: `HiringRequisition` (or evolve `hiring_requests`), `ApprovalStage`, `ApprovalDecision`, `AuditEvent` (append-only), `CompensationBand`, `OfferVersion`, `OfferTemplate`.
- Workflow config model (admin UI vs YAML/DB JSON) and SLA policy matrix.
- Decision on **eSign vendor** and **candidate access** (OTP vs magic link vs account) — PRD §10 open questions.

**Exit:** Signed workflow + audit schema; legal/compliance sign-off on retention (7y) and PII handling.

### Phase 1 — Data model + audit spine (3–5 weeks)

**Implemented in repo (initial slice):** `hiring_offer_audit_events` + `recordHiringOfferAuditEvent`, extended `hiring_requests` (BRD fields, statuses, `req_code` via `allocate_hiring_request_code`), `saveDraft` on create, GET `pending` tab mapped to `submitted`/`under_review`, offer lifecycle audit hooks, offer status `negotiating` for counters, `workflow_instances` / `workflow_stages` + DB trigger for finance SLA on new offers, stubs `compensation_bands` / `offer_document_versions`, `POST /api/cron/workflow-sla`, `GET /api/audit/hiring-offer`. Remaining: CSV/PDF export, HM read policy on audit, 50%/90% reminders, full requisition workflow stages.

1. **Append-only `audit_events`** (or partition-ready table) written from a single server-side helper; backfill hooks for existing tables where feasible.
2. Extend or replace `hiring_requests` to support BRD fields and status machine (Draft → Submitted → …).
3. **REQ-ID** generation (`REQ-[DEPT]-[YYYY]-[SEQ]`) with org-scoped sequences.
4. Emit audit events on: requisition create/submit/approve/reject, offer state transitions, candidate response.

**Exit:** Compliance can export a CSV of events for a given `req_id` / `offer_id` (PDF can follow).

### Phase 2 — Workflow engine MVP (4–6 weeks)

1. Generic **stage** model for requisitions and offers (sequential first; parallel second).
2. **SLA fields** per stage + scheduled job (Vercel cron / queue) for 50%/90%/100%/200% rules.
3. **Escalation targets** per org (delegate user, role, or group).
4. Wire existing **finance offer approval** as one stage in the new engine (migrate `offer_approvals` usage).

**Exit:** End-to-end requisition and offer flows configurable without code deploy (minimum: DB-driven rules).

### Phase 3 — Compensation & offer document (4–8 weeks)

1. `compensation_bands` + validation service (yellow/red thresholds per PRD).
2. **Exception path** branches workflow to additional approvers.
3. **Offer templates** + PDF generation (server-side) + `offer_versions` with hash + storage path.
4. Fix **counter-offer** semantics: new version + restart from comp stage; do not mark offer `approved` on counter.

**Exit:** Final approval produces versioned PDF within NFR target; band violations cannot bypass exception path.

### Phase 4 — Candidate experience & approvals UX (3–5 weeks)

1. **OTP/magic-link** public offer view (no full account required) + rate limits.
2. Enforce **no compensation in email** — link-only templates.
3. **eSign** integration post-view (webhook updates offer + audit).
4. **Email action tokens** for approvers (time-limited, one-time).

**Exit:** PRD F-09/F-12 satisfied for pilot geography.

### Phase 5 — Integrations & analytics (ongoing)

1. ATS sync (job + candidate status) — start with **webhooks + CSV fallback** (BRD R-002).
2. HRMS headcount/budget read-only for Finance context.
3. Dashboards: stage TAT, SLA breach rate, traceability % (events present / required events).

**Exit:** PRD Phase 2 exit criteria for pilot customer.

---

## 5. Suggested engineering sequencing (first sprints)

| Sprint focus | Outcome                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| **S1**       | `audit_events` + writer helper + instrument `POST/PATCH` hiring-requests and offers |
| **S2**       | Requisition schema expansion + REQ-ID + status machine                              |
| **S3**       | Workflow tables + migrate finance offer step                                        |
| **S4**       | SLA cron + notifications + escalation audit events                                  |
| **S5**       | Bands + offer validation + exception branch                                         |
| **S6**       | PDF offer version + storage + candidate OTP page                                    |

---

## 6. Traceability: PRD features → status

| Feature                           | Status in TigerHire                                            |
| --------------------------------- | -------------------------------------------------------------- |
| F-01 Requisition form             | **Partial** (subset of fields; no REQ-ID; simplified statuses) |
| F-02 Multi-tier workflow          | **Missing** (orchestrator is separate concern)                 |
| F-03 SLA / escalation             | **Missing**                                                    |
| F-04 Immutable audit              | **Missing** for hiring/offer domain                            |
| F-05 Offer initiation             | **Partial**                                                    |
| F-06 Band validation              | **Missing**                                                    |
| F-07 Offer letter generation      | **Missing**                                                    |
| F-08 Offer approval (multi-stage) | **Partial** (finance only)                                     |
| F-09 Candidate portal + sign      | **Partial** (in-app candidate, no OTP/e-sign)                  |
| F-10 HR dashboard                 | **Partial** (general dashboards; not offer workflow KPIs)      |
| F-11 ATS/HRMS                     | **Missing** (documented gaps elsewhere)                        |
| F-12 Email deep-link approvals    | **Missing**                                                    |
| F-13–F-20                         | **Missing** / backlog                                          |

---

## 7. Related internal docs

- `docs/PRODUCT_FEATURE_GAPS.md` — broader platform gaps including SAML, Workday, Greenhouse.
- `docs/help/interview-scheduling-flow.md` — shortlist/interview behavior adjacent to “selection” in BRD §2.1.

---

## 8. Next step for stakeholders

1. Confirm **MVP scope**: TigerHire-native workflow first vs integration-first.
2. Resolve **open questions** in PRD §10 (eSign, OTP-only portal, band source, delegation depth, counter rounds, retention).
3. Assign **owners** for legal templates and band data (BRD §8.2) before Phase 3.
