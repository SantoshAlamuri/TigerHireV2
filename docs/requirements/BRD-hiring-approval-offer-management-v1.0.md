# Business Requirements Document (BRD)

## Hiring Approval & Offer Management System

**From Hiring Requisition to Offer Rollout**

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Document Type | Business Requirements Document (BRD) |
| Version       | 1.0                                  |
| Date          | April 2026                           |
| Status        | Draft                                |

---

## Document Control

### Revision History

| Version | Date     | Author             | Description      |
| ------- | -------- | ------------------ | ---------------- |
| 1.0     | Apr 2026 | HR Technology Team | Initial draft    |
| 1.1     | TBD      | Stakeholder Review | Pending approval |

### Document Approvals

| Name                  | Role                          | Signature | Date |
| --------------------- | ----------------------------- | --------- | ---- |
| CHRO                  | Chief Human Resources Officer |           |      |
| VP Talent Acquisition | Talent Acquisition Lead       |           |      |
| CTO                   | Chief Technology Officer      |           |      |
| VP Finance            | Financial Approver            |           |      |

---

## 1. Executive Summary

This Business Requirements Document (BRD) defines the end-to-end process and system requirements for a Hiring Approval & Offer Management System. The solution spans the full hiring lifecycle — from the initiation of a hiring requisition, through multi-tier approvals, candidate selection, compensation benchmarking, and offer letter generation, to formal offer rollout and acceptance tracking.

Every decision made during the hiring and offer process must be captured, timestamped, and attributed to the responsible stakeholder to ensure full auditability and compliance.

### 1.1 Business Problem

Organizations today face the following challenges in hiring workflows:

- Lack of a unified approval system causing delays in role approvals and offer rollouts
- No structured decision audit trail, leading to compliance gaps and disputes
- Fragmented communication between HR, Finance, Talent Acquisition, and hiring managers
- Manual offer creation prone to errors in compensation, designation, and joining dates
- Inability to track offer status in real-time, causing poor candidate experience
- No escalation mechanism when approvers are unavailable, causing bottlenecks

### 1.2 Proposed Solution

A centralized, workflow-driven Hiring Approval & Offer Management System that:

- Automates the entire requisition-to-offer pipeline with configurable approval stages
- Captures every decision — approvals, rejections, holds, exceptions — with full context
- Integrates with HRMS, payroll, and ATS platforms
- Provides real-time dashboards and audit reports for HR, Finance, and compliance teams
- Enables digital offer generation, delivery, and candidate acceptance tracking

### 1.3 Strategic Objectives

- Reduce average time-to-offer by 40% through automated approval routing
- Achieve 100% decision traceability across all hiring and offer workflows
- Eliminate manual data entry errors in offer letters
- Ensure compliance with internal compensation bands and local labor regulations
- Improve candidate NPS by delivering offers within 24 hours of final approval

---

## 2. Business Scope

### 2.1 In Scope

- Hiring Requisition Creation — Role, department, headcount, budget justification
- Requisition Approval Workflow — Multi-tier approvals (Hiring Manager, Finance, CHRO)
- Candidate Shortlisting & Interview Outcome Tracking
- Verbal Offer Discussion & Candidate Expectation Capture
- Compensation Benchmarking & Band Validation
- Offer Letter Generation with auto-population of approved parameters
- Offer Approval Workflow — HR, Finance, Legal sign-off
- Offer Dispatch & Digital Delivery to candidate
- Candidate Response Tracking — Accepted, Negotiating, Declined
- Decision Audit Log — Full timeline of every decision with actor, timestamp, and notes
- Escalation & Delegation Management
- Reporting & Analytics Dashboards

### 2.2 Out of Scope

- Payroll execution and salary disbursement
- Background verification process (BGV) — integration point only
- Employee onboarding after offer acceptance
- Learning management and training modules
- Performance management post-joining

### 2.3 Key Constraints

| Constraint     | Type               | Details                                                                               |
| -------------- | ------------------ | ------------------------------------------------------------------------------------- |
| Data Privacy   | Legal / Compliance | Candidate PII must comply with GDPR, DPDP Act (India), and local data protection laws |
| Integration    | Technical          | Must integrate with existing ATS (Workday / Greenhouse / BambooHR) and HRMS           |
| Budget         | Financial          | All offers must stay within pre-approved compensation bands or trigger exception flow |
| Timeline       | Project            | MVP to be delivered within 5 months of project kickoff                                |
| Access Control | Security           | Role-based access; salary data visible only to HR, Finance, and approving managers    |

---

## 3. Stakeholders & Roles

### 3.1 Primary Stakeholders

| Stakeholder                | Role in System             | Responsibilities                                                          | Access Level               |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| Hiring Manager             | Requester / Decision Maker | Raises requisition, approves shortlists, participates in offer decision   | Own requisitions & offers  |
| HR Business Partner (HRBP) | Process Owner              | Reviews requisitions, manages offer creation, tracks candidate status     | Full HR module access      |
| Talent Acquisition (TA)    | Coordinator                | Sources candidates, updates interview outcomes, initiates offer workflows | Candidate & offer tracking |
| Finance / Budget Owner     | Approver (Budget)          | Reviews headcount budget, approves compensation outside standard bands    | Financial data access      |
| Legal / Compliance         | Approver (Risk)            | Reviews non-standard clauses, relocation terms, equity components         | Offer document access      |
| CHRO / HR Head             | Final Approver             | Approves senior-level hires, exceptions, and out-of-band compensation     | Full system access         |
| Candidate                  | External Recipient         | Receives offer, digitally signs, submits acknowledgment                   | Portal access only         |
| IT / System Admin          | Configuration Owner        | Manages workflows, roles, integrations, and system settings               | Admin access               |

### 3.2 Secondary Stakeholders

- Payroll Team — Receives finalized offer data for salary setup
- BGV Vendor — Triggered post-acceptance for background checks
- Onboarding Team — Receives joining date and role details
- Audit & Compliance — Access to read-only audit trail reports

---

## 4. Business Requirements

### 4.1 Hiring Requisition Management

**REQ-HR-001:** The system shall allow authorized users to raise a Hiring Requisition with the following mandatory fields:

- Job Title and Level / Band
- Department and Cost Center
- Employment Type (Full-time, Contract, Intern)
- Location (City, Remote, Hybrid)
- Budgeted Headcount and whether replacement or new headcount
- Business Justification
- Target Joining Date
- Approved Budget (CTC range)

**REQ-HR-002:** Every requisition must be assigned a unique Requisition ID with format `REQ-[DEPT]-[YEAR]-[SEQ]`.

**REQ-HR-003:** Requisitions must transition through defined statuses: Draft → Submitted → Under Review → Approved / Rejected / On Hold.

### 4.2 Approval Workflow Requirements

**REQ-WF-001:** The system shall support configurable multi-tier approval chains based on:

- Seniority level of the role (L1–L5 bands)
- Headcount type (new vs. backfill)
- Compensation range (within band vs. exception)
- Location-specific rules (international hires require additional sign-off)

**REQ-WF-002:** Standard Requisition Approval Flow:

| Stage   | Approver               | SLA      | Action on Expiry                    |
| ------- | ---------------------- | -------- | ----------------------------------- |
| Stage 1 | Hiring Manager         | 24 hours | Auto-escalate to next level manager |
| Stage 2 | HR Business Partner    | 24 hours | Escalate to HR Head                 |
| Stage 3 | Finance / Budget Owner | 48 hours | Escalate to CFO delegate            |
| Stage 4 | CHRO (for L4+ roles)   | 48 hours | Flag to CEO office                  |

**REQ-WF-003:** Each approver must provide one of the following decisions: Approve, Reject (with reason), Hold (with reason + resume date), Approve with Comments, or Delegate to another user.

**REQ-WF-004:** Parallel approval shall be supported for Finance and Legal reviews when compensation has both budget and legal implications.

### 4.3 Offer Decision & Tracking Requirements

**REQ-OF-001:** Upon candidate selection, the TA team shall initiate an Offer Workflow with:

- Candidate details (name, current CTC, expected CTC, notice period)
- Proposed CTC components (base, variable, benefits, signing bonus, ESOPs)
- Designation and joining date
- Special clauses (relocation, non-compete, IP assignment)

**REQ-OF-002:** The system shall validate proposed compensation against pre-loaded band structures and flag out-of-band offers for exception approval.

**REQ-OF-003:** The system shall support parallel and sequential offer approvals:

| Decision Point            | Approver      | Decision Options                | SLA      |
| ------------------------- | ------------- | ------------------------------- | -------- |
| Compensation Review       | HR Comp & Ben | Approve / Flag / Adjust         | 4 hours  |
| Budget Confirmation       | Finance HRBP  | Approve / Reject / Hold         | 8 hours  |
| Legal / Compliance Review | Legal Team    | Approve / Flag Clauses / Reject | 12 hours |
| Final Offer Approval      | CHRO / HR VP  | Approve / Reject / Revise       | 24 hours |

**REQ-OF-004:** Every decision in the offer flow must be captured with: decision type, decision timestamp, approver identity, comments/reason, and document version approved.

### 4.4 Audit Trail & Decision Tracking

**REQ-AUD-001:** The system shall maintain an immutable audit log for every event in the hiring lifecycle with:

- Event Type (Created, Submitted, Approved, Rejected, Modified, Escalated, Withdrawn)
- Actor (User ID, Name, Role)
- Timestamp (UTC)
- Previous State and New State
- Comments / Rejection Reason
- IP Address and device type
- Document version reference (for offer letters)

**REQ-AUD-002:** Audit logs shall be tamper-proof and retained for a minimum of 7 years in compliance with labor law requirements.

**REQ-AUD-003:** All offer versions (v1.0, v1.1, etc.) must be stored with the corresponding approval decision for each version.

**REQ-AUD-004:** The system shall generate an Offer Decision Summary report showing all decisions made during the offer lifecycle of each candidate.

---

## 5. Business Process Flows

### 5.1 Hiring Requisition Flow

| Step | Actor          | Action                                         | System Response                                        |
| ---- | -------------- | ---------------------------------------------- | ------------------------------------------------------ |
| 1    | Hiring Manager | Logs into system and initiates new requisition | Generates REQ-ID, sets status to Draft                 |
| 2    | Hiring Manager | Fills requisition form and submits             | Validates mandatory fields, routes to HRBP             |
| 3    | HRBP           | Reviews requisition for completeness           | Sends back to HM if incomplete, else routes to Finance |
| 4    | Finance        | Validates headcount budget and approves        | Updates budget ledger; routes to CHRO if L4+           |
| 5    | CHRO           | Approves or rejects requisition                | Publishes JD to ATS; notifies TA team                  |
| 6    | System         | Transitions requisition to Approved status     | Triggers TA sourcing workflow in ATS                   |

### 5.2 Offer Rollout & Decision Flow

| Step | Actor         | Action                                           | Decision Tracked                                       |
| ---- | ------------- | ------------------------------------------------ | ------------------------------------------------------ |
| 1    | TA Recruiter  | Initiates offer workflow after verbal discussion | Candidate CTC expectations captured                    |
| 2    | HR Comp & Ben | Validates compensation vs. band structure        | In-band approval OR exception flag                     |
| 3    | Finance HRBP  | Confirms budget availability for proposed CTC    | Budget approved / shortfall flagged                    |
| 4    | Legal         | Reviews special clauses in offer template        | Legal sign-off / clause modification                   |
| 5    | CHRO / HR VP  | Final review and offer approval                  | Final approval with version sign-off                   |
| 6    | System        | Generates offer letter from approved parameters  | Offer letter version locked                            |
| 7    | TA / HR       | Dispatches offer to candidate via portal         | Delivery receipt captured                              |
| 8    | Candidate     | Reviews and responds to offer                    | Accepted / Counter / Declined tracked                  |
| 9    | System        | Captures final candidate decision with timestamp | Closes offer workflow; triggers onboarding or re-offer |

---

## 6. Non-Functional Business Requirements

### 6.1 Compliance & Legal

- All compensation data must comply with Equal Pay Act / local equivalent regulations
- Offer letters must carry legally valid digital signatures (eSign Act / IT Act compliant)
- Candidate data retention per GDPR Article 5 (purpose limitation and storage limitation)
- Audit logs must be exportable in PDF/CSV format for legal discovery purposes

### 6.2 Data Security

- Role-based access control (RBAC) — compensation visible only to HR, Finance, and approvers
- All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- Candidate offer portal access protected via OTP-based authentication
- No salary data exposed in notification emails — link-based access only

### 6.3 Performance & Availability

- System must maintain 99.5% uptime SLA with planned maintenance windows
- Approval notification delivery within 60 seconds of trigger
- Offer letter generation within 30 seconds of final approval
- Audit report generation for 10,000+ records in under 10 seconds

### 6.4 Usability

- Mobile-responsive interface for approvers to approve/reject on the go
- Approvers can take action via email deep-link without logging in
- System supports English and regional language offer letters

---

## 7. Business Success Metrics & KPIs

| KPI                                           | Current Baseline | Target (12 Months) | Measurement Method               |
| --------------------------------------------- | ---------------- | ------------------ | -------------------------------- |
| Time to Offer (Requisition to Offer Dispatch) | ~15 days         | < 9 days           | System timestamp analytics       |
| Offer Approval TAT                            | ~5 days          | < 2 days           | Workflow stage timing            |
| Decision Traceability Coverage                | ~40%             | 100%               | Audit log completeness score     |
| Offer Letter Error Rate                       | ~12%             | < 1%               | Post-dispatch correction tickets |
| Candidate Offer Acceptance Rate               | ~72%             | > 85%              | Offer response tracking          |
| Time to Fill (Approved Req to Joining)        | ~45 days         | < 30 days          | ATS + system data                |
| Compliance Audit Pass Rate                    | ~65%             | > 98%              | Internal audit findings          |

---

## 8. Assumptions & Dependencies

### 8.1 Assumptions

- Compensation band structures are maintained and updated quarterly by HR Comp & Ben team
- All approvers will have active system accounts before go-live
- Integration APIs for existing ATS (Workday/Greenhouse) are available and documented
- Legal templates for offer letters are standardized and signed-off before system build
- IT infrastructure meets the required security and hosting standards

### 8.2 Dependencies

| Dependency             | Owner           | Required By | Risk if Delayed                      |
| ---------------------- | --------------- | ----------- | ------------------------------------ |
| ATS Integration Spec   | IT / ATS Vendor | Month 2     | Manual data entry required           |
| Compensation Band Data | HR Comp & Ben   | Month 1     | Band validation cannot be configured |
| Legal Offer Templates  | Legal Team      | Month 3     | Offer generation module blocked      |
| eSign Platform Setup   | IT / Vendor     | Month 3     | Digital signing unavailable          |
| RBAC Design Sign-off   | Security / HR   | Month 1     | Access control cannot be built       |

---

## 9. Risk Register

| Risk ID | Risk Description                                          | Likelihood | Impact | Mitigation                                                                   |
| ------- | --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------- |
| R-001   | Approvers bypass system and approve verbally/over email   | High       | High   | Enforce system-only approval policy; no HR action without system approval ID |
| R-002   | Integration failures with existing ATS/HRMS               | Medium     | High   | Build fallback CSV import/export during transition period                    |
| R-003   | Compensation band data outdated or incomplete             | Medium     | Medium | Quarterly band refresh process with Finance ownership                        |
| R-004   | Low adoption by hiring managers (tool fatigue)            | Medium     | Medium | UX testing, mobile approval flows, email-based actions                       |
| R-005   | Audit log storage cost for high-volume hiring             | Low        | Low    | Tiered storage with hot/cold archiving after 2 years                         |
| R-006   | Legal non-compliance in offer template across geographies | Low        | High   | Legal sign-off per geography before template activation                      |

---

## 10. Glossary

| Term                 | Definition                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Hiring Requisition   | A formal request to fill a position, approved by Finance and CHRO before recruiting begins |
| CTC                  | Cost to Company — the total compensation package offered to a candidate                    |
| Compensation Band    | Pre-defined salary range for a job level/grade used to benchmark offers                    |
| Decision Audit Trail | Immutable log of every approval, rejection, modification, and escalation action            |
| Offer Workflow       | The sequential and parallel approval stages required before an offer is dispatched         |
| Out-of-Band Offer    | A compensation offer that exceeds the defined band for a role level                        |
| TAT                  | Turnaround Time — time taken to complete an approval or workflow stage                     |
| TA                   | Talent Acquisition — team responsible for recruiting and candidate management              |
| HRBP                 | HR Business Partner — HR representative aligned to a specific business unit                |
| eSign                | Electronic digital signature compliant with applicable laws                                |
