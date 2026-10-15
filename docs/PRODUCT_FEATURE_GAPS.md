# TigerHire Product Feature Gaps Analysis

## Executive Summary

Based on comprehensive analysis of the TigerHire platform, this document identifies feature gaps across all user roles. The platform supports core hiring workflows including messaging, scheduling, scorecards, custom pipelines, analytics, saved searches, notifications, and audit logging. Remaining gaps are documented below.

Note: this file includes historical scoring content. For implementation-accurate integration and compliance status, use `docs/security/integration-compliance-inventory.md` as the canonical reference.

**Overall Product Maturity**: 78/100 (Launch-ready; key P0 features shipped)
**Target Maturity for 5M Users**: 90/100 (Enterprise-Grade)

---

## Feature Gap Matrix by User Role

### 1. Candidate Features (Current Score: 60/100)

#### 1.1 Profile & Discovery (GAP: HIGH)

| Feature                                       | Status     | Priority | Impact   |
| --------------------------------------------- | ---------- | -------- | -------- |
| Profile completeness indicator                | ✅ Exists  | -        | Medium   |
| Skills assessment/quiz                        | ❌ Missing | P1       | High     |
| Portfolio/projects showcase                   | ❌ Missing | P1       | High     |
| Video introduction                            | ❌ Missing | P2       | Medium   |
| Multi-language support (Hindi, Tamil, Telugu) | ❌ Missing | P1       | Critical |
| Career trajectory visualization               | ❌ Missing | P2       | Medium   |
| Salary insights by role/location              | ⚠️ Partial | P1       | High     |
| Market value estimator                        | ❌ Missing | P1       | High     |

**Recommended Implementation:**

```typescript
// New types for enhanced candidate profiles
interface CandidatePortfolio {
  projects: Project[];
  certifications: Certification[];
  publications: Publication[];
  speakingEngagements: SpeakingEvent[];
  openSourceContributions: GitHubRepo[];
}

interface CandidateSkillsAssessment {
  skillId: string;
  proficiency: 1-10;
  verifiedBy: 'test' | 'employer' | 'self';
  assessmentDate: string;
  testScores: SkillTestResult[];
}
```

#### 1.2 Job Matching & Discovery (GAP: MEDIUM)

| Feature                         | Status                           | Priority | Impact |
| ------------------------------- | -------------------------------- | -------- | ------ |
| AI-powered job recommendations  | ✅ Exists (FitScore)             | -        | -      |
| Job alert notifications         | ✅ Exists (alerts)               | -        | -      |
| Saved searches                  | ✅ Full (CRUD + alert frequency) | -        | -      |
| Company comparison tool         | ❌ Missing                       | P2       | Medium |
| Culture fit assessment          | ❌ Missing                       | P1       | High   |
| Interview preparation resources | ⚠️ Partial                       | P1       | High   |
| Salary negotiation assistant    | ❌ Missing                       | P2       | Medium |
| Remote work filters             | ⚠️ Basic                         | P1       | High   |

#### 1.3 Application Management (GAP: MEDIUM)

| Feature                                | Status                       | Priority | Impact |
| -------------------------------------- | ---------------------------- | -------- | ------ |
| Application tracking dashboard         | ✅ Exists                    | -        | -      |
| Application status notifications       | ✅ Exists                    | -        | -      |
| Withdraw application                   | ✅ Exists                    | -        | -      |
| Re-apply to same company               | ❌ Missing                   | P2       | Medium |
| Application analytics (views, matches) | ❌ Missing                   | P1       | High   |
| Cover letter / notes on applications   | ✅ Exists (cover_note field) | -        | -      |
| Resume version management              | ✅ Exists                    | -        | -      |
| Application deadline reminders         | ❌ Missing                   | P2       | Medium |

#### 1.4 Communication & Engagement (GAP: LOW)

| Feature                          | Status                                                        | Priority | Impact |
| -------------------------------- | ------------------------------------------------------------- | -------- | ------ |
| In-app messaging with recruiters | ✅ Full (conversations, messages, attachments, unread)        | -        | -      |
| Interview scheduling             | ✅ Full (slots, book, cancel, reschedule, Google/Outlook ICS) | -        | -      |
| Video interview integration      | ⚠️ Partial (provider plumbing exists)                         | P1       | High   |
| Chatbot for FAQ                  | ❌ Missing                                                    | P2       | Medium |
| Push notifications (mobile)      | ❌ Missing                                                    | P1       | High   |
| WhatsApp integration             | ✅ Exists                                                     | -        | -      |
| Notifications (in-app + email)   | ✅ Full (dropdown, templates, preferences)                    | -        | -      |

---

### 2. Recruiter Features (Current Score: 70/100)

#### 2.1 Candidate Sourcing (GAP: MEDIUM)

| Feature                         | Status     | Priority | Impact |
| ------------------------------- | ---------- | -------- | ------ |
| Talent pool search              | ✅ Exists  | -        | -      |
| FitScore ranking                | ✅ Exists  | -        | -      |
| Boolean search operators        | ❌ Missing | P1       | High   |
| Saved candidate lists           | ⚠️ Basic   | P1       | High   |
| AI-powered sourcing suggestions | ❌ Missing | P1       | High   |
| Diversity sourcing filters      | ❌ Missing | P1       | High   |
| Passive candidate outreach      | ❌ Missing | P2       | Medium |
| Source effectiveness analytics  | ❌ Missing | P1       | High   |
| Resume parsing (bulk upload)    | ⚠️ Partial | P1       | High   |
| LinkedIn profile import         | ❌ Missing | P2       | Medium |

#### 2.2 Pipeline Management (GAP: MEDIUM)

| Feature                          | Status                                        | Priority | Impact   |
| -------------------------------- | --------------------------------------------- | -------- | -------- |
| Custom pipeline stages           | ✅ Full (per job, drag reorder)               | -        | -        |
| Drag-and-drop pipeline           | ✅ Full                                       | -        | -        |
| Pipeline stage automation        | ❌ Missing                                    | P1       | High     |
| Bulk actions on candidates       | ❌ Missing                                    | P1       | High     |
| Pipeline analytics & forecasting | ✅ Full (dashboard + charts)                  | -        | -        |
| Time-to-hire tracking            | ✅ Full                                       | -        | -        |
| Offer management                 | ⚠️ Partial (draft/send/signing and approvals) | P0       | Critical |
| Background check integration     | ⚠️ Partial (SpringVerify path)                | P2       | Medium   |
| E-signature for offers           | ⚠️ Partial (native offer signing flow)        | P1       | High     |

**Recommended Schema:**

```sql
-- Custom pipeline stages per organisation
CREATE TABLE custom_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index integer NOT NULL,
  color text DEFAULT '#3b82f6',
  automation_rules jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- Offers
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id),
  salary_offered integer,
  benefits jsonb,
  start_date date,
  expiry_date date,
  status offer_status DEFAULT 'draft',
  document_url text,
  signed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

#### 2.3 Collaboration & Workflow (GAP: MEDIUM)

| Feature                               | Status                                               | Priority | Impact |
| ------------------------------------- | ---------------------------------------------------- | -------- | ------ |
| Hiring team management                | ⚠️ Basic                                             | P1       | High   |
| Comments on candidates                | ❌ Missing                                           | P1       | High   |
| @mentions and notifications           | ❌ Missing                                           | P1       | High   |
| Interview feedback forms              | ✅ Full (custom templates, ratings, recommendations) | -        | -      |
| Scorecards for interviewers           | ✅ Full                                              | -        | -      |
| Calendar integration (Google/Outlook) | ✅ Full (ICS links)                                  | -        | -      |
| Meeting room booking                  | ❌ Missing                                           | P2       | Medium |
| Candidate notes & tags                | ⚠️ Basic                                             | P1       | High   |
| Activity history                      | ⚠️ Basic                                             | P2       | Medium |
| Document sharing                      | ❌ Missing                                           | P2       | Medium |

#### 2.4 Analytics & Reporting (GAP: MEDIUM)

| Feature                                     | Status                                 | Priority | Impact   |
| ------------------------------------------- | -------------------------------------- | -------- | -------- |
| Analytics (time-to-hire, pipeline, sources) | ✅ Full (4 views + dashboard + charts) | -        | -        |
| Custom reports builder                      | ❌ Missing                             | P0       | Critical |
| Dashboard widgets                           | ✅ Exists                              | -        | -        |
| Export to Excel/CSV                         | ❌ Missing                             | P1       | High     |
| Scheduled reports                           | ❌ Missing                             | P2       | Medium   |
| Diversity analytics                         | ❌ Missing                             | P1       | High     |
| Source effectiveness                        | ✅ Exists (analytics views)            | -        | -        |
| Cost-per-hire tracking                      | ❌ Missing                             | P1       | High     |
| Team performance metrics                    | ❌ Missing                             | P2       | Medium   |
| Predictive hiring analytics                 | ❌ Missing                             | P2       | Medium   |

**Recommended Implementation:**

```typescript
interface RecruitingMetrics {
  // Pipeline metrics
  timeToFill: number; // Days from req to hire
  timeToHire: number; // Days from application to hire
  offerAcceptanceRate: number; // Percentage

  // Sourcing metrics
  candidatesBySource: Record<string, number>;
  conversionRates: {
    appliedToPhone: number;
    phoneToInterview: number;
    interviewToOffer: number;
    offerToHire: number;
  };

  // Quality metrics
  qualityOfHire: number; // Performance rating of hires
  retentionRate: number; // 1-year retention

  // Diversity metrics
  diversityBreakdown: {
    gender: Record<string, number>;
    ethnicity: Record<string, number>;
    age: Record<string, number>;
  };
}
```

---

### 3. Company Admin Features (Current Score: 55/100)

#### 3.1 User Management (GAP: MEDIUM)

| Feature                     | Status                                      | Priority | Impact   |
| --------------------------- | ------------------------------------------- | -------- | -------- |
| Team member invitations     | ✅ Exists                                   | -        | -        |
| Role-based permissions      | ⚠️ Basic                                    | P1       | High     |
| Seat management             | ⚠️ Basic                                    | P1       | High     |
| Department hierarchy        | ❌ Missing                                  | P2       | Medium   |
| Single Sign-On (SSO)        | ⚠️ Partial (OAuth SSO + org enforcement)    | P0       | Critical |
| SAML integration            | ❌ Missing                                  | P1       | High     |
| SCIM provisioning           | ✅ Exists                                   | P2       | Medium   |
| Audit logs for user actions | ✅ Full (user_audit_log + access_audit_log) | -        | -        |
| Two-factor authentication   | ❌ Missing                                  | P0       | Critical |
| API key management          | ❌ Missing                                  | P2       | Medium   |

#### 3.2 Billing & Subscription (GAP: MEDIUM)

| Feature                  | Status     | Priority | Impact |
| ------------------------ | ---------- | -------- | ------ |
| Subscription management  | ✅ Stripe  | -        | -      |
| Usage analytics          | ⚠️ Basic   | P1       | High   |
| Invoice history          | ❌ Missing | P2       | Medium |
| Billing alerts           | ❌ Missing | P1       | High   |
| Multiple payment methods | ❌ Missing | P2       | Medium |
| Purchase orders          | ❌ Missing | P2       | Medium |
| Annual billing           | ❌ Missing | P2       | Medium |
| Plan comparison tool     | ✅ Exists  | -        | -      |

#### 3.3 Settings & Configuration (GAP: HIGH)

| Feature                                  | Status                                                     | Priority | Impact   |
| ---------------------------------------- | ---------------------------------------------------------- | -------- | -------- |
| Branding customization                   | ❌ Missing                                                 | P2       | Medium   |
| Career page builder                      | ❌ Missing                                                 | P1       | High     |
| Custom email templates                   | ❌ Missing                                                 | P2       | Medium   |
| Job board integrations                   | ⚠️ Partial                                                 | P1       | High     |
| ATS integration (HiBob, Darwinbox, Keka) | ⚠️ Planned                                                 | P0       | Critical |
| Webhook configuration                    | ❌ Missing                                                 | P2       | Medium   |
| Data retention settings                  | ⚠️ Partial                                                 | P1       | High     |
| GDPR compliance settings                 | ⚠️ Partial (consent/erasure/settings; DSAR parity pending) | P0       | Critical |

---

### 4. AI/ML Features (Current Score: 75/100)

#### 4.1 Current AI Agents

| Agent                        | Status     | Capability                                                   |
| ---------------------------- | ---------- | ------------------------------------------------------------ |
| Talent Scout                 | ✅ Active  | CV parsing, intent scoring                                   |
| Hiring Signal                | ✅ Active  | Job discovery, company signals                               |
| FitScore                     | ✅ Active  | Matching algorithm                                           |
| Verify                       | ⚠️ Partial | Profile verification                                         |
| Candidate Authenticity Check | ⚠️ Partial | CV authenticity / manipulation signals (`ghostbuster` agent) |

#### 4.2 Missing AI Features (GAP: MEDIUM)

| Feature                            | Status     | Priority | Impact   |
| ---------------------------------- | ---------- | -------- | -------- |
| Interview question generator       | ❌ Missing | P1       | High     |
| Candidate ranking explanation      | ⚠️ Partial | P1       | High     |
| Salary recommendation engine       | ❌ Missing | P1       | High     |
| Job description optimizer          | ❌ Missing | P2       | Medium   |
| Bias detection in job descriptions | ❌ Missing | P0       | Critical |
| Automated outreach personalization | ❌ Missing | P1       | High     |
| Chatbot for candidate screening    | ❌ Missing | P2       | Medium   |
| Resume gap analysis                | ❌ Missing | P2       | Medium   |
| Skills gap recommendations         | ❌ Missing | P2       | Medium   |
| Predictive attrition risk          | ❌ Missing | P2       | Medium   |
| Market intelligence reports        | ❌ Missing | P2       | Medium   |

**Recommended AI Feature:**

```typescript
// Bias detection in job descriptions
interface BiasDetectionResult {
  overallScore: number; // 0-100 (higher is less biased)
  flags: {
    genderedLanguage: string[]; // "rockstar", "ninja", "dominant"
    ageBias: string[]; // "young", "energetic", "digital native"
    educationBias: string[]; // "IIT only", "top-tier college"
    culturalBias: string[]; // Culture fit requirements
  };
  suggestions: string[];
  inclusiveAlternative: string; // Rewritten JD
}
```

---

### 5. Mobile Experience (Current Score: 20/100)

| Feature                    | Status     | Priority | Impact |
| -------------------------- | ---------- | -------- | ------ |
| Native iOS app             | ❌ Missing | P1       | High   |
| Native Android app         | ❌ Missing | P1       | High   |
| Responsive web app         | ✅ Exists  | -        | -      |
| PWA support                | ❌ Missing | P2       | Medium |
| Push notifications         | ❌ Missing | P1       | High   |
| Mobile-optimized workflows | ⚠️ Partial | P1       | High   |
| Offline mode               | ❌ Missing | P2       | Medium |
| Biometric authentication   | ❌ Missing | P2       | Medium |

---

### 6. Integrations (Current Score: 55/100)

#### 6.1 ATS/HRIS Integrations (GAP: CRITICAL)

| System             | Status     | Priority |
| ------------------ | ---------- | -------- |
| HiBob              | ⚠️ Planned | P0       |
| Darwinbox          | ⚠️ Planned | P0       |
| Keka               | ⚠️ Planned | P0       |
| Workday            | ❌ Missing | P1       |
| SAP SuccessFactors | ❌ Missing | P1       |
| BambooHR           | ❌ Missing | P2       |
| Greenhouse         | ❌ Missing | P1       |
| Lever              | ❌ Missing | P1       |

Current implementation note: headcount-plan sync scaffolding exists, but broad ATS/HRIS vendor sync (B5) is still a gap.

#### 6.2 Communication Integrations (GAP: HIGH)

| System          | Status     | Priority |
| --------------- | ---------- | -------- |
| WhatsApp        | ✅ Exists  | -        |
| Email (Resend)  | ✅ Exists  | -        |
| Slack           | ⚠️ Partial | P1       |
| Microsoft Teams | ⚠️ Partial | P2       |
| Zoom            | ⚠️ Partial | P1       |
| Google Meet     | ⚠️ Partial | P1       |
| Calendly        | ❌ Missing | P2       |

#### 6.3 Assessment Integrations (GAP: MEDIUM)

| System       | Status     | Priority |
| ------------ | ---------- | -------- |
| HackerRank   | ❌ Missing | P2       |
| Codility     | ❌ Missing | P2       |
| TestGorilla  | ❌ Missing | P2       |
| Mercer Mettl | ❌ Missing | P2       |
| SHL          | ❌ Missing | P3       |

#### 6.4 Background Check (GAP: MEDIUM)

| Provider     | Status     | Priority |
| ------------ | ---------- | -------- |
| SpringVerify | ⚠️ Partial | P2       |
| BetterPlace  | ❌ Missing | P2       |
| AuthBridge   | ❌ Missing | P2       |
| IDfy         | ❌ Missing | P2       |

---

### 7. Security & Compliance (Current Score: 65/100)

| Feature                    | Status                             | Priority | Impact   |
| -------------------------- | ---------------------------------- | -------- | -------- |
| SOC 2 Type II              | ❌ Missing                         | P0       | Critical |
| ISO 27001                  | ❌ Missing                         | P1       | High     |
| GDPR compliance            | ⚠️ Partial                         | P0       | Critical |
| DPDP (India) compliance    | ❌ Missing                         | P0       | Critical |
| Data encryption at rest    | ✅ Exists                          | -        | -        |
| Data encryption in transit | ✅ Exists                          | -        | -        |
| Field-level encryption     | ❌ Missing                         | P1       | High     |
| Audit logging              | ✅ Full (user + access audit logs) | -        | -        |
| Penetration testing        | ❌ Missing                         | P1       | High     |
| Bug bounty program         | ❌ Missing                         | P2       | Medium   |
| Data residency controls    | ⚠️ Partial                         | P1       | High     |

---

### 8. Enterprise Features (Current Score: 40/100)

| Feature                      | Status     | Priority | Impact |
| ---------------------------- | ---------- | -------- | ------ |
| Custom data fields           | ❌ Missing | P1       | High   |
| Advanced permissions (RBAC)  | ⚠️ Basic   | P1       | High   |
| Workflow automation          | ❌ Missing | P1       | High   |
| SLA management               | ❌ Missing | P2       | Medium |
| Dedicated support            | ❌ Missing | P2       | Medium |
| Custom contracts             | ❌ Missing | P2       | Medium |
| Volume pricing               | ❌ Missing | P2       | Medium |
| Data export (full)           | ❌ Missing | P1       | High   |
| On-premise deployment option | ❌ Missing | P3       | Low    |
| White-labeling               | ❌ Missing | P3       | Low    |

---

## Prioritized Feature Roadmap

### Phase 1: Launch Readiness (Months 1-2)

**Must-Have for Public Launch:**

- [x] In-app messaging (candidate ↔ recruiter) — ✅ Full
- [x] Interview scheduling with calendar integration (slots, book, cancel, reschedule, ICS)
- [x] Interview feedback forms & scorecards (custom templates, ratings, recommendations)
- [x] Custom pipeline stages (per job, drag reorder)
- [x] Resume version management
- [x] Application withdrawal
- [x] Basic analytics dashboard (time-to-hire, pipeline, sources, 4 views + charts)

### Phase 2: Core Competitiveness (Months 3-4)

**Required to compete with LinkedIn/Naukri:**

- [ ] SSO & SAML integration
- [ ] Two-factor authentication
- [ ] Skills assessments
- [ ] Salary insights & estimator
- [ ] Job alert customization
- [x] Saved searches (CRUD + alert frequency)
- [ ] Diversity sourcing filters
- [ ] Comments & @mentions
- [ ] Bulk actions on candidates

### Phase 3: Scale & Automation (Months 5-6)

**For 100K+ users:**

- [ ] Workflow automation
- [ ] Pipeline stage automation
- [ ] Custom reports builder
- [ ] Advanced analytics
- [ ] ATS integrations (HiBob, Darwinbox, Keka)
- [ ] Video interview integration
- [ ] AI interview question generator
- [ ] Bias detection
- [ ] Mobile apps (iOS/Android)

### Phase 4: Enterprise (Months 7-9)

**For large enterprise customers:**

- [ ] Advanced RBAC
- [x] Audit logs (user_audit_log + access_audit_log)
- [ ] SCIM provisioning
- [ ] Custom data fields
- [ ] Career page builder
- [ ] Advanced integrations
- [ ] SOC 2 Type II
- [ ] Background check integrations
- [ ] Offer management with e-signature

### Phase 5: AI Differentiation (Months 10-12)

**Competitive moat:**

- [ ] Predictive hiring analytics
- [ ] Market intelligence
- [ ] Automated outreach
- [ ] Chatbot screening
- [ ] Resume gap analysis
- [ ] Skills gap recommendations
- [ ] Culture fit assessment
- [ ] Advanced personalization

---

## Feature-Scale Correlation

| Feature              | 1K Users | 50K Users | 1M Users | 5M Users |
| -------------------- | -------- | --------- | -------- | -------- |
| Basic job posting    | ✅       | ✅        | ✅       | ✅       |
| FitScore             | ✅       | ✅        | ✅       | ✅       |
| WhatsApp integration | ✅       | ✅        | ✅       | ✅       |
| Interview scheduling | -        | ✅        | ✅       | ✅       |
| SSO/SAML             | -        | -         | ✅       | ✅       |
| Mobile apps          | -        | -         | ✅       | ✅       |
| Advanced analytics   | -        | -         | -        | ✅       |
| Multi-region         | -        | -         | -        | ✅       |
| AI differentiation   | -        | -         | -        | ✅       |

---

## Competitive Analysis

### TigerHire vs Competitors

| Feature              | TigerHire                            | LinkedIn   | Naukri | Indeed   | Greenhouse |
| -------------------- | ------------------------------------ | ---------- | ------ | -------- | ---------- |
| AI FitScore          | ✅ Unique                            | ⚠️ Partial | ❌     | ⚠️ Basic | ❌         |
| WhatsApp Integration | ✅ Unique                            | ❌         | ❌     | ❌       | ❌         |
| Intent Scoring       | ✅ Unique                            | ❌         | ❌     | ❌       | ❌         |
| Hiring Signals       | ✅ Unique                            | ⚠️ Partial | ❌     | ❌       | ❌         |
| Interview Scheduling | ✅ Full                              | ✅         | ❌     | ❌       | ✅         |
| ATS Integration      | ⚠️ Planned                           | ✅         | ⚠️     | ⚠️       | ✅         |
| Mobile App           | ❌                                   | ✅         | ✅     | ✅       | ✅         |
| Analytics            | ✅ Full (4 views, dashboard, charts) | ✅         | ⚠️     | ✅       | ✅         |
| Global Reach         | ❌                                   | ✅         | ⚠️     | ✅       | ⚠️         |

**Key Differentiators to Maintain:**

1. AI-powered FitScore with explainability
2. WhatsApp-first approach for India
3. Intent signal detection
4. Bias-reduced matching

---

## Recommended Next Features (Top 10)

_Already shipped (no longer gaps): In-app messaging, interview scheduling + calendar/ICS, custom pipeline stages + drag reorder, interview feedback & scorecards, analytics (time-to-hire, pipeline, sources), saved searches with alerts, notifications (in-app + email), audit logging, cover notes on applications._

1. **SSO & 2FA** (P0)
   - SAML integration
   - Google/Microsoft SSO
   - Mandatory 2FA for enterprise

2. **Offer Management & E-Signature** (P0)
   - Offer creation, send, track
   - E-signature integration

3. **Skills Assessments** (P1)
   - Built-in assessments
   - Third-party integrations
   - Verified skills badges

4. **Mobile Apps** (P1)
   - iOS and Android
   - Push notifications
   - Mobile-optimized workflows

5. **ATS Integrations** (P1)
   - HiBob, Darwinbox, Keka
   - Bidirectional sync
   - Webhook events

6. **Advanced Analytics** (P1)
   - Custom reports builder
   - Export to Excel/CSV
   - Scheduled reports

7. **Bias Detection** (P1)
   - JD analysis
   - Sourcing bias alerts
   - Diversity reporting

8. **Bulk actions on candidates** (P1)

9. **Pipeline stage automation** (P1)

10. **Workflow automation** (P1)

---

## Success Metrics by Phase

### Phase 1

- [ ] 80% of recruiters use interview scheduling
- [ ] 90% of candidates complete profiles
- [ ] < 2min average time to schedule

### Phase 2

- [ ] 50% enterprise adoption
- [ ] 4.5+ app store rating
- [ ] 30% increase in matches

### Phase 3

- [ ] 100K+ daily active users
- [ ] 10 ATS integrations live
- [ ] SOC 2 certification

### Phase 4

- [ ] 50 enterprise customers
- [ ] 99.99% uptime
- [ ] < 200ms API p99 latency

### Phase 5

- [ ] 5M registered users
- [ ] #1 hiring platform in India
- [ ] 40% market share (AI-powered hiring)

---

## Navigation / shell backlog (sidebar audit — follow-ups)

Track as separate initiatives (not “easy win” scope):

| Initiative                    | Intent                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **⌘K command palette**        | Global jump: every nav item + key actions (e.g. create job, invite); keeps surface area low for dense sidebars. |
| **Desktop icon-only sidebar** | Collapse to ~64px with tooltips; persist preference (e.g. `localStorage`).                                      |
| **Org switcher**              | Multi-tenant B2B table stakes; needs org list API, RBAC, and shell placement (sidebar or header).               |

---

**Document Version**: 1.1  
**Last Updated**: March 2026  
**Owner**: Product Management Team

**Changelog (v1.1):** Updated status for shipped features: in-app messaging, interview scheduling + calendar/ICS, interview feedback & scorecards, custom pipeline stages (per job, drag reorder), analytics (time-to-hire, pipeline, sources, 4 views + dashboard + charts), saved searches with alerts, notifications (in-app + email), audit logging (user_audit_log + access_audit_log), cover letter/notes on applications. Phase 1 and selected Phase 2/4 items marked complete.
