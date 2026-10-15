# Product Requirements Document (PRD)

## Hiring Approval & Offer Management System

**End-to-End Product Specification with Decision Tracking**

| Field         | Value                               |
| ------------- | ----------------------------------- |
| Document Type | Product Requirements Document (PRD) |
| Version       | 1.0                                 |
| Date          | April 2026                          |
| Status        | Draft for Engineering Review        |

---

## Document Control

### Revision History

| Version | Date     | Author               | Change Summary    |
| ------- | -------- | -------------------- | ----------------- |
| 1.0     | Apr 2026 | Product Management   | Initial PRD draft |
| 1.1     | TBD      | Engineering + Design | Pending UX review |

---

## 1. Product Overview

### 1.1 Product Vision

Build a centralized, intelligent, and auditable Hiring Approval & Offer Management System that eliminates manual bottlenecks, captures every hiring decision, and gives HR and business leaders full visibility and control from requisition initiation to offer acceptance.

### 1.2 Problem Statement

Hiring decisions today are scattered across emails, spreadsheets, and verbal conversations. There is no single source of truth for:

- Who approved a requisition and when
- What compensation was discussed and what was eventually offered
- Why an offer was revised or an exception approved
- Whether the final offer is within policy and budget

This creates compliance risk, slows down hiring, and leads to poor candidate experience.

### 1.3 Goals & Non-Goals

| Goals                                               | Non-Goals                                 |
| --------------------------------------------------- | ----------------------------------------- |
| Automate requisition-to-offer approval workflows    | Payroll processing or salary disbursement |
| Capture 100% of decisions with full audit trail     | Candidate sourcing or job board posting   |
| Enable digital offer generation and dispatch        | Background verification execution         |
| Provide real-time dashboards for HR and Finance     | Performance management post-onboarding    |
| Support configurable approval chains per role level | Learning & Development module             |

---

## 2. User Personas

### 2.1 Persona 1 — Hiring Manager (Priya, VP Engineering)

Background: Priya manages a team of 35 engineers and raises 10–15 hiring requisitions per quarter. She needs to quickly initiate and track open roles.

- **Goals:** Fast approvals, visibility on where her reqs are stuck
- **Pain Points:** No visibility after submitting a req, approvals stuck with Finance for days
- **Key Actions:** Create requisition, review shortlisted candidates, approve offer parameters

### 2.2 Persona 2 — HR Business Partner (Rahul, HRBP)

Background: Rahul manages 3 business units, handles 40+ offer workflows per quarter. He needs a streamlined system to avoid offer mistakes.

- **Goals:** Single dashboard for all pending offer actions, automated offer letter generation
- **Pain Points:** Manual offer letter creation, version confusion, no SLA enforcement
- **Key Actions:** Initiate offer workflow, validate comp, dispatch offer, track candidate response

### 2.3 Persona 3 — Finance HRBP (Sneha, Finance Partner)

Background: Sneha approves all compensation exceptions. She receives 20+ offer approvals weekly and needs context before approving.

- **Goals:** See full compensation context (band, market data, budget impact) before deciding
- **Pain Points:** No data to make informed decisions, approving blind over email
- **Key Actions:** Review offers against budget, approve/reject/flag, add notes

### 2.4 Persona 4 — Candidate (Arjun, Software Engineer)

Background: Arjun has received an offer and wants a seamless, professional experience to review, negotiate, and sign.

- **Goals:** View offer clearly, ask questions, sign digitally, receive confirmation
- **Pain Points:** Receiving offers via email with no acknowledgment mechanism, unclear process
- **Key Actions:** View offer portal, accept / raise counter, e-sign, download signed copy

---

## 3. Feature Overview & Prioritization

| Feature ID | Feature Name                                    | Module           | Priority          | Release |
| ---------- | ----------------------------------------------- | ---------------- | ----------------- | ------- |
| F-01       | Hiring Requisition Form & Submission            | Requisition      | P0 - Must Have    | MVP     |
| F-02       | Multi-Tier Approval Workflow Engine             | Workflow         | P0 - Must Have    | MVP     |
| F-03       | SLA Timers & Escalation Engine                  | Workflow         | P0 - Must Have    | MVP     |
| F-04       | Decision Audit Trail & Immutable Log            | Compliance       | P0 - Must Have    | MVP     |
| F-05       | Offer Initiation & Parameter Capture            | Offer Mgmt       | P0 - Must Have    | MVP     |
| F-06       | Compensation Band Validation Engine             | Offer Mgmt       | P0 - Must Have    | MVP     |
| F-07       | Offer Letter Auto-Generation                    | Offer Mgmt       | P0 - Must Have    | MVP     |
| F-08       | Offer Approval Workflow (Parallel + Sequential) | Workflow         | P0 - Must Have    | MVP     |
| F-09       | Candidate Offer Portal (View + Sign + Counter)  | Candidate Portal | P0 - Must Have    | MVP     |
| F-10       | Real-Time HR Dashboard                          | Analytics        | P1 - High         | MVP     |
| F-11       | ATS / HRMS Integration                          | Integration      | P1 - High         | MVP     |
| F-12       | Email Deep-Link Approvals (Mobile-Friendly)     | Notification     | P1 - High         | MVP     |
| F-13       | Offer Version Control & Comparison View         | Offer Mgmt       | P1 - High         | R2      |
| F-14       | Exception Workflow for Out-of-Band Offers       | Workflow         | P1 - High         | R2      |
| F-15       | Decision Summary PDF Report per Candidate       | Reporting        | P1 - High         | R2      |
| F-16       | Delegation & Proxy Approval                     | Workflow         | P2 - Medium       | R2      |
| F-17       | Advanced Analytics (Time-to-Offer, Bottlenecks) | Analytics        | P2 - Medium       | R3      |
| F-18       | Multi-Language Offer Letter Support             | Offer Mgmt       | P2 - Medium       | R3      |
| F-19       | BGV Integration Trigger Post-Acceptance         | Integration      | P3 - Nice to Have | R3      |
| F-20       | AI-Powered Comp Benchmarking Suggestions        | Offer Mgmt       | P3 - Nice to Have | Backlog |

---

## 4. Detailed Feature Specifications

### 4.1 F-01: Hiring Requisition Form & Submission

**Description:** A structured form to capture all details required to open and route a new hiring request for approval.

**User Stories**

- As a Hiring Manager, I want to raise a requisition so that I can get headcount approval before recruiting.
- As an HRBP, I want to see all submitted requisitions in one place so that I can track progress.

**Acceptance Criteria**

| ID      | Criteria                                                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01-1 | Form must capture: Job Title, Level, Department, Cost Center, Employment Type, Location, Headcount Type (New/Backfill), Business Justification, CTC Range, Target Start Date |
| AC-01-2 | All mandatory fields must be validated before submission is allowed                                                                                                          |
| AC-01-3 | System auto-generates Requisition ID in format `REQ-[DEPT]-[YYYY]-[SEQ]` on submission                                                                                       |
| AC-01-4 | Draft save functionality allows partial saves without triggering workflow                                                                                                    |
| AC-01-5 | Submitted requisition shows status breadcrumb: Draft > Submitted > Under Review > Approved/Rejected                                                                          |
| AC-01-6 | Submitter receives confirmation email with REQ-ID and next approver name within 2 minutes                                                                                    |

### 4.2 F-02: Multi-Tier Approval Workflow Engine

**Description:** Configurable workflow engine that routes requisitions and offers through the correct approval chain based on role level, compensation band, headcount type, and geography.

**Workflow Configuration Rules**

| Condition                             | Approval Chain                     | Parallel Allowed?                          |
| ------------------------------------- | ---------------------------------- | ------------------------------------------ |
| IC roles (L1–L2), in-band, backfill   | HRBP > Finance                     | No                                         |
| IC roles (L1–L2), out-of-band, new HC | HRBP > Finance > Comp Exception    | Finance + Comp in parallel                 |
| Manager roles (L3–L4)                 | HRBP > Finance > CHRO              | Finance + CHRO parallel on Finance approve |
| Director+ roles (L5+)                 | HRBP > Finance > Legal > CHRO      | Finance + Legal parallel                   |
| International hires                   | HRBP > Finance > Legal > Global HR | Finance + Legal parallel                   |

**Acceptance Criteria**

- Workflow rules must be configurable by HR admins without code changes
- Each stage must have a configurable SLA in hours (default: 24h for HR/HM, 48h for Finance/CHRO)
- System must send reminder notifications at 50% and 90% of SLA elapsed
- On SLA breach, system auto-escalates to the defined escalation contact

### 4.3 F-03: SLA & Escalation Engine

**Description:** Automated SLA tracking per workflow stage with multi-level escalation.

| SLA Event              | Trigger                               | Action                                                      |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------- |
| 50% SLA elapsed        | Stage pending > 50% of configured SLA | Send reminder to pending approver                           |
| 90% SLA elapsed        | Stage pending > 90% of configured SLA | Send urgent reminder + CC manager                           |
| 100% SLA breach        | Stage pending > 100% of SLA           | Auto-escalate; notify HR Ops; log escalation in audit trail |
| Extended breach (200%) | Stage pending > 2x SLA                | Flag to CHRO; mark as priority; send daily digest           |

### 4.4 F-04: Decision Audit Trail (Core Module)

**Description:** The audit trail is the central nervous system of this product. Every action in the system — including inaction (SLA breach) — must be captured with full context.

**Audit Event Schema**

| Field             | Type     | Description              | Example                         |
| ----------------- | -------- | ------------------------ | ------------------------------- |
| event_id          | UUID     | Unique event identifier  | evt_a1b2c3d4                    |
| req_id / offer_id | String   | Parent object reference  | REQ-ENG-2026-042                |
| event_type        | Enum     | Type of event            | OFFER_APPROVED                  |
| actor_id          | String   | User who triggered event | usr_rahul_hrbp                  |
| actor_role        | String   | Role of the actor        | HRBP                            |
| timestamp_utc     | DateTime | When event occurred      | 2026-04-10T14:32:11Z            |
| prev_status       | String   | State before event       | PENDING_FINANCE                 |
| new_status        | String   | State after event        | PENDING_CHRO                    |
| decision          | Enum     | Decision taken           | APPROVED                        |
| comments          | Text     | Reason / notes           | Within band, recommend approval |
| document_version  | String   | Offer letter version     | v1.2                            |
| ip_address        | String   | Actor IP (masked)        | 192.168.x.x                     |
| channel           | Enum     | How action was taken     | WEB / EMAIL_LINK / MOBILE       |

**Acceptance Criteria**

- Every status change, approval, rejection, modification, escalation, and delegation must create an audit event
- Audit records must be immutable — no update or delete operations permitted on committed events
- Audit log must be exportable as CSV and PDF
- HR and Compliance teams can filter audit log by: date range, event type, actor, status, requisition ID, offer ID
- Candidate-facing events (offer opened, signed, declined) must also be logged

### 4.5 F-05 & F-06: Offer Initiation & Compensation Validation

**Offer Initiation Fields**

| Field                | Type                     | Validation Rule                               |
| -------------------- | ------------------------ | --------------------------------------------- |
| Candidate Name       | Text                     | Mandatory                                     |
| Current CTC          | Numeric (INR/USD)        | Mandatory; formats as currency                |
| Expected CTC         | Numeric                  | Mandatory                                     |
| Proposed Base Salary | Numeric                  | Auto-check against band min/max for level     |
| Variable Pay (%)     | Numeric                  | Must be within company policy range for level |
| Signing Bonus        | Numeric                  | Triggers exception workflow if > threshold    |
| ESOPs / RSUs         | Numeric (units or value) | Triggers Legal review                         |
| Joining Date         | Date                     | Must be > today + notice period               |
| Notice Period        | Numeric (days)           | Mandatory                                     |
| Relocation Allowance | Boolean + Amount         | Triggers Legal review if applicable           |
| Non-Compete Clause   | Boolean                  | Triggers Legal review if yes                  |
| Designation          | Dropdown                 | Linked to approved level/band                 |

**Band Validation Logic**

- On save of proposed compensation, system queries the band table for `[role_level, department, location]`
- If proposed CTC falls within band: proceed normally
- If proposed CTC is 0–15% above band max: flag with yellow warning; Comp & Ben reviewer notified
- If proposed CTC is >15% above band max: block submission; mandatory exception approval required

### 4.6 F-07: Offer Letter Auto-Generation

**Description:** Upon final offer approval, the system generates a versioned, templated offer letter auto-populated with all approved parameters.

**Template Engine Requirements**

- Support multiple offer letter templates by: employment type, location, seniority level, business unit
- Auto-populate fields: candidate name, designation, department, CTC components, joining date, reporting manager, work location, notice period, probation period
- Each generated document carries: version number, generation timestamp, approver sign-off block, and digital signature placeholder
- Version v1.0 generated on first approval; each re-generation increments minor version (v1.1, v1.2)
- Previous versions are archived and accessible via audit trail

### 4.7 F-08: Offer Approval Workflow

**Sequential + Parallel Approval Support**

| Stage                           | Type                     | Approver      | SLA      | Decision Options                     |
| ------------------------------- | ------------------------ | ------------- | -------- | ------------------------------------ |
| Stage 1 — Comp Review           | Sequential               | HR Comp & Ben | 4 hours  | Approve / Flag / Modify & Approve    |
| Stage 2a — Budget               | Parallel                 | Finance HRBP  | 8 hours  | Approve / Reject / Hold for Budget   |
| Stage 2b — Legal (if triggered) | Parallel                 | Legal Team    | 12 hours | Approve / Flag Clause / Reject       |
| Stage 3 — Final Approval        | Sequential (after 2a+2b) | CHRO / HR VP  | 24 hours | Approve / Reject / Send for Revision |

**Decision Tracking Requirements**

- Every offer approval decision must be logged with full context (decision, comments, timestamp, actor)
- When a revision is requested, system creates a new offer version and restarts from Stage 1
- Offer version history must show a clear diff of what changed between versions

### 4.8 F-09: Candidate Offer Portal

**Description:** A secure, mobile-responsive portal where candidates can view their offer, ask questions, counter-propose, and e-sign.

**Portal Screens**

- Offer Summary Screen — All CTC components in a clean, tabular layout
- Offer Document Viewer — View full offer letter PDF inline
- Accept / Counter / Decline Action Bar — With mandatory comments on Counter and Decline
- Counter Proposal Form — Candidate submits counter CTC with justification
- E-Sign Screen — DocuSign / Aadhaar eSign / equivalent integration
- Confirmation Screen — Post-sign confirmation with downloadable signed copy

**Decision Tracking — Candidate Actions**

| Candidate Action        | Event Logged                                          | Notification Triggered                                     |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Opens offer portal link | OFFER_VIEWED by candidate (timestamp)                 | HR notified                                                |
| Accepts offer           | OFFER_ACCEPTED (timestamp, IP)                        | HR + HM + Onboarding notified                              |
| Raises counter          | OFFER_COUNTER with counter CTC and reason             | HR + HM notified; counter review workflow starts           |
| Declines offer          | OFFER_DECLINED with reason category                   | HR + HM notified; talent pool or re-req workflow triggered |
| Signs offer digitally   | OFFER_SIGNED (signature ID, timestamp, document hash) | HR receives signed copy; system archives                   |
| Offer link expires      | OFFER_EXPIRED (auto-system event)                     | HR alerted; re-dispatch option shown                       |

---

## 5. Data Model Overview

### 5.1 Core Entities

| Entity            | Key Fields                                                                                     | Relationships                                     |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| HiringRequisition | req_id, title, level, department, status, created_by, approved_budget                          | Has many ApprovalStages, linked to one Offer      |
| Offer             | offer_id, req_id, candidate_id, proposed_ctc, status, version, generated_at                    | Has many OfferVersions, many ApprovalDecisions    |
| ApprovalStage     | stage_id, parent_id, parent_type, approver_id, stage_type, sla_hours, status                   | Belongs to Req or Offer; has one ApprovalDecision |
| ApprovalDecision  | decision_id, stage_id, actor_id, decision, comments, timestamp_utc                             | Belongs to ApprovalStage; logged to AuditTrail    |
| AuditEvent        | event_id, entity_id, entity_type, event_type, actor_id, prev_status, new_status, timestamp_utc | Immutable log of all state changes                |
| Candidate         | candidate_id, name, email, current_ctc, expected_ctc, status, offer_response                   | Linked to one active Offer                        |
| CompensationBand  | band_id, role_level, department, location, min_ctc, mid_ctc, max_ctc                           | Referenced by OfferValidation engine              |
| OfferTemplate     | template_id, name, employment_type, location, version, content                                 | Used by Offer auto-generation engine              |

---

## 6. Notifications & Communication Design

### 6.1 Notification Events

| Trigger Event          | Recipient                   | Channel              | Content Summary                                         |
| ---------------------- | --------------------------- | -------------------- | ------------------------------------------------------- |
| Requisition submitted  | First-level approver        | Email + In-App       | New req pending review with direct approve/reject links |
| Requisition approved   | Requester + TA team         | Email + In-App       | Req approved, JD publishing triggered                   |
| Requisition rejected   | Requester + HRBP            | Email + In-App       | Rejection reason + option to resubmit                   |
| SLA 50% elapsed        | Pending approver            | Email                | Reminder with time remaining and approve link           |
| SLA breach             | Approver + Manager + HR Ops | Email + In-App + SMS | Escalation notice with action required                  |
| Offer created          | Comp & Ben reviewer         | Email + In-App       | New offer pending comp validation                       |
| Offer approved (final) | TA + HM + Candidate         | Email + In-App       | Offer finalized; candidate receives portal link         |
| Offer dispatched       | Candidate (OTP access)      | Email + SMS          | Secure link to offer portal with OTP                    |
| Offer accepted         | HR + HM + Onboarding        | Email + In-App       | Candidate accepted; onboarding workflow triggered       |
| Offer declined         | HR + HM + TA                | Email + In-App       | Candidate declined with reason; re-req options shown    |
| Counter received       | HR + HM                     | Email + In-App       | Counter details + route to decision workflow            |

### 6.2 Notification Design Principles

- Salary data must NEVER appear in email notifications — portal access only
- All action buttons in email must use time-limited, one-time secure tokens
- Notifications must be sent within 60 seconds of triggering event
- Digest mode available for high-volume approvers (batches hourly)

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric                        | Requirement                       |
| ----------------------------- | --------------------------------- |
| Requisition form load time    | < 2 seconds                       |
| Approval action processing    | < 3 seconds end-to-end            |
| Offer letter generation       | < 30 seconds after final approval |
| Dashboard load (50k+ records) | < 5 seconds                       |
| Audit log query (1M+ events)  | < 10 seconds with pagination      |
| Notification delivery         | < 60 seconds from trigger event   |

### 7.2 Scalability

- System must support up to 50,000 concurrent users
- Must handle 10,000 active requisitions and 5,000 active offers simultaneously
- Audit event table must be partitioned for performance at 100M+ rows

### 7.3 Security

- Authentication: SSO via SAML 2.0 / OAuth 2.0 (OKTA / Azure AD compatible)
- Authorization: Role-Based Access Control (RBAC) with field-level security for compensation data
- Offer portal: OTP-based authentication for candidate access; no account creation required
- All API endpoints must require authenticated sessions and implement rate limiting
- Audit log writes must be append-only; no UPDATE or DELETE on committed events
- All PII must be encrypted at field level; keys managed via HSM or cloud KMS

### 7.4 Availability & Recovery

- System SLA: 99.5% uptime (excluding planned maintenance windows)
- Recovery Time Objective (RTO): < 4 hours for critical systems
- Recovery Point Objective (RPO): < 1 hour (hourly backups)
- Planned maintenance must be scheduled between 02:00–04:00 local time with 48-hour notice

---

## 8. API & Integration Requirements

### 8.1 Core API Endpoints

| Endpoint                                    | Method | Description                          | Auth Required        |
| ------------------------------------------- | ------ | ------------------------------------ | -------------------- |
| POST /api/v1/requisitions                   | POST   | Create a new hiring requisition      | Yes — Hiring Manager |
| GET /api/v1/requisitions/{id}               | GET    | Fetch requisition details by ID      | Yes — RBAC           |
| POST /api/v1/requisitions/{id}/decisions    | POST   | Submit approval decision for a stage | Yes — Approver       |
| GET /api/v1/offers/{id}                     | GET    | Fetch offer details                  | Yes — RBAC           |
| POST /api/v1/offers                         | POST   | Initiate new offer workflow          | Yes — HR / TA        |
| POST /api/v1/offers/{id}/decisions          | POST   | Submit offer approval decision       | Yes — Approver       |
| GET /api/v1/audit/{entity_type}/{entity_id} | GET    | Fetch full audit trail for entity    | Yes — HR / Admin     |
| POST /api/v1/candidates/{id}/response       | POST   | Submit candidate offer response      | Yes — OTP token      |
| GET /api/v1/reports/offer-summary/{id}      | GET    | Generate offer decision summary PDF  | Yes — HR / Admin     |

### 8.2 Integration Points

| System                         | Integration Type       | Direction     | Data Exchanged                                      |
| ------------------------------ | ---------------------- | ------------- | --------------------------------------------------- |
| Workday / Greenhouse (ATS)     | REST API / Webhook     | Bidirectional | Job postings, candidate records, interview outcomes |
| HRMS (Workday / SAP)           | REST API               | Bidirectional | Employee records, org structure, headcount data     |
| Payroll System                 | REST API / File Export | Outbound      | Finalized offer parameters on candidate joining     |
| BGV Vendor (KEKA / AuthBridge) | Webhook                | Outbound      | Trigger check on offer acceptance                   |
| DocuSign / eSign Platform      | REST API               | Bidirectional | Offer letter signing, signed document retrieval     |
| SSO Provider (OKTA / Azure)    | SAML 2.0               | Inbound       | User authentication and session management          |
| Notification Gateway           | REST API               | Outbound      | Email, SMS, in-app push notifications               |

---

## 9. Release Plan & Milestones

| Phase                              | Timeline  | Features Delivered                                                              | Exit Criteria                                              |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Phase 0 — Discovery & Design       | Month 1   | UX wireframes, workflow configuration design, band data load                    | Stakeholder sign-off on designs                            |
| Phase 1 — MVP (Core Flow)          | Month 2–3 | F-01 to F-09: Requisition, Approvals, Audit, Offer Generation, Candidate Portal | End-to-end flow working in staging; security review passed |
| Phase 2 — Integrations & Reporting | Month 4   | F-10 to F-15: Dashboards, ATS/HRMS integration, Exception workflows, Reporting  | Integration tests passed; UAT sign-off by HR & Finance     |
| Phase 3 — Scale & Enhancements     | Month 5   | F-16 to F-18: Delegation, Advanced Analytics, Multi-language offers             | Performance benchmark passed; user training complete       |
| Phase 4 — AI & Optimization        | Month 6+  | F-19, F-20: BGV integration, AI comp benchmarking                               | Pilot with 2 business units; success metric review         |

### 9.1 Go-Live Checklist

- All P0 features tested and signed off by QA
- Security penetration test completed with no critical findings
- Data migration of compensation bands completed and validated
- Role-based access configured for all user groups
- Integration smoke tests with ATS and HRMS passed
- HR team training completed (< 4 hours per role)
- Candidate portal tested on mobile (iOS + Android) and desktop
- Rollback plan documented and tested
- Go-live communication sent to all stakeholders

---

## 10. Open Questions & Decisions Required

| Question                                                                            | Owner              | Due Date | Impact                                     |
| ----------------------------------------------------------------------------------- | ------------------ | -------- | ------------------------------------------ |
| Which eSign provider will be used? (DocuSign vs Aadhaar eSign vs vendor)            | IT + Legal         | Month 1  | Offer signing module blocked until decided |
| Should the candidate portal require account creation or OTP-only access?            | Product + Security | Month 1  | Affects portal security design             |
| Will compensation bands be loaded manually or synced from Workday?                  | HR Comp + IT       | Month 1  | Affects band validation module build       |
| How many levels of delegation are allowed? (e.g., can a delegate further delegate?) | HR Policy          | Month 2  | Delegation engine depth configuration      |
| Should the system support counter-offer negotiation rounds? (max 2? 3?)             | HR Policy          | Month 2  | Counter workflow complexity                |
| What is the data retention policy for declined candidates' offer data?              | Legal / Compliance | Month 1  | GDPR compliance design                     |

---

## 11. Overall Acceptance Criteria

### 11.1 Functional Acceptance

- A Hiring Requisition can be created, submitted, approved, and converted to an active JD end-to-end
- Every approval, rejection, escalation, and delegation is captured in the audit trail with full actor and timestamp context
- Out-of-band compensation offers trigger an exception approval workflow before proceeding
- Offer letter is auto-generated within 30 seconds of final approval with all approved parameters
- Candidate can access offer portal, view all CTC components, and digitally sign the offer
- HR can generate an Offer Decision Summary report showing every decision made for any candidate

### 11.2 Non-Functional Acceptance

- Security penetration test passed with no critical/high findings
- 99.5% uptime maintained over 30-day post-launch period
- All P0 features load and respond within defined performance benchmarks
- Role-based access verified: no compensation data visible to unauthorized roles
