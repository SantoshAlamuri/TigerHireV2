# TigerHire April 2nd Launch Plan

## Executive Summary

**Launch Date**: April 2, 2026 (39 days from Feb 22, 2026)  
**Current State**: Production-ready for controlled launch (Grade B, 77.25/100)  
**Target State**: Public Launch Ready for ~50K users  
**Theme**: "Hire Smarter, Hire Faster"

---

## Current Readiness Assessment (as of Feb 22)

| Dimension             | Score         | Status | Launch Requirement      |
| --------------------- | ------------- | ------ | ----------------------- |
| Security              | 85/100        | B      | EXCEEDS (Target: 80)    |
| Reliability           | 78/100        | C+     | EXCEEDS (Target: 75)    |
| Performance           | 76/100        | C+     | MEETS (Target: 75)      |
| Code Quality          | 82/100        | B      | EXCEEDS (Target: 75)    |
| Test Coverage         | 52/100        | F      | NEEDS WORK (Target: 70) |
| Observability         | 76/100        | C+     | MEETS (Target: 75)      |
| Speed/Maintainability | 78/100        | C+     | MEETS (Target: 75)      |
| **OVERALL**           | **77.25/100** | **B**  | **MEETS** (Target: 75)  |

### Production Readiness: YES (with reservations)

The platform is technically ready for a controlled launch. Primary blockers are **test coverage** and **missing critical product features**.

---

## Critical Path to April 2nd Launch

### Must-Have for Launch (Non-Negotiable)

| Priority | Feature                   | Current Status | Effort    | Owner       |
| -------- | ------------------------- | -------------- | --------- | ----------- |
| P0       | Test Coverage ≥ 70%       | 5-10%          | 3 weeks   | Engineering |
| P0       | Interview Scheduling      | Missing        | 2.5 weeks | Product/Eng |
| P0       | In-App Messaging (Basic)  | Missing        | 2 weeks   | Engineering |
| P0       | Interview Feedback Forms  | Missing        | 1 week    | Engineering |
| P0       | Custom Pipeline Stages    | Missing        | 1.5 weeks | Engineering |
| P0       | Redis Caching             | Missing        | 1 week    | Platform    |
| P0       | Application Withdrawal    | Missing        | 3 days    | Engineering |
| P0       | Resume Version Management | Missing        | 4 days    | Engineering |

### Should-Have for Launch (High Impact)

| Priority | Feature                     | Current Status | Effort | Owner       |
| -------- | --------------------------- | -------------- | ------ | ----------- |
| P1       | SSO (Google/LinkedIn OAuth) | Missing        | 1 week | Engineering |
| P1       | Basic Analytics Dashboard   | Partial        | 1 week | Engineering |
| P1       | Job Alert Customization     | Basic          | 4 days | Engineering |
| P1       | Saved Searches              | Missing        | 3 days | Engineering |
| P1       | PWA Support                 | Missing        | 3 days | Engineering |
| P1       | Email Preferences           | Partial        | 2 days | Engineering |

### Nice-to-Have (If Time Permits)

| Priority | Feature                     | Effort  |
| -------- | --------------------------- | ------- |
| P2       | Skills Assessments          | 2 weeks |
| P2       | Mobile App (MVP)            | 3 weeks |
| P2       | ATS Integration (1: HiBob)  | 2 weeks |
| P2       | Video Interview Integration | 1 week  |
| P2       | Advanced Analytics          | 1 week  |

---

## 6-Week Sprint Plan

### Week 1 (Feb 23 - Mar 1): Foundation & Architecture

**Goals**: Set up infrastructure for launch sprint; begin critical feature development

#### Engineering Tasks

- [ ] Deploy Redis cluster (Upstash for quick start)
- [ ] Implement connection pooling for Supabase
- [ ] Set up API rate limiting (per tier)
- [ ] Add comprehensive logging for launch monitoring
- [ ] Create feature flags for gradual rollout

#### Product Tasks

- [ ] Finalize interview scheduling requirements
- [ ] Design in-app messaging UI mockups
- [ ] Create interview feedback form templates
- [ ] Define custom pipeline stage requirements
- [ ] Review and approve all P0 feature specs

#### Testing Tasks

- [ ] Set up coverage tracking dashboard
- [ ] Identify critical paths for testing (auth, payments, core workflows)
- [ ] Create test plan for launch features
- [ ] Begin writing tests for existing critical paths

**Deliverables**:

- Redis operational
- 100+ new tests written
- Feature flag system live
- P0 specs approved

---

### Week 2 (Mar 2 - Mar 8): Core Features - Part 1

**Goals**: Build interview scheduling and custom pipeline stages

#### Engineering Tasks

- [ ] **Interview Scheduling API**
  - Calendar integration endpoints (Google/Outlook)
  - Availability management
  - Meeting creation
  - Reminder notifications
- [ ] **Custom Pipeline Stages**
  - Database schema for custom stages
  - CRUD APIs for stage management
  - Migration from fixed to custom stages
- [ ] **Application Withdrawal**
  - Withdraw API endpoint
  - UI for candidate withdrawal
  - Notification to recruiter

#### Product Tasks

- [ ] Review scheduling UI designs
- [ ] Create default pipeline templates
- [ ] Write help documentation for new features
- [ ] Prepare training materials for sales team

#### Testing Tasks

- [ ] Unit tests for scheduling API
- [ ] Integration tests for pipeline stages
- [ ] E2E tests for application withdrawal
- [ ] Coverage target: 30%

**Deliverables**:

- Interview scheduling API complete
- Custom pipeline stages functional
- Application withdrawal live
- 30% test coverage

---

### Week 3 (Mar 9 - Mar 15): Core Features - Part 2

**Goals**: Build in-app messaging and interview feedback forms

#### Engineering Tasks

- [ ] **In-App Messaging**
  - Real-time messaging architecture (WebSockets/Pusher)
  - Message persistence
  - Thread management
  - File attachments (basic)
  - Notification integration
- [ ] **Interview Feedback Forms**
  - Form builder backend
  - Scorecard templates
  - Submission and storage
  - Aggregated views
- [ ] **Resume Version Management**
  - Version control for resumes
  - UI for version selection
  - Default version handling

#### Product Tasks

- [ ] Design messaging interface
- [ ] Create default feedback form templates
- [ ] Define notification rules for messages
- [ ] Create user guides

#### Testing Tasks

- [ ] Messaging unit and integration tests
- [ ] Feedback form tests
- [ ] Resume version tests
- [ ] Coverage target: 50%

**Deliverables**:

- In-app messaging functional
- Interview feedback forms live
- Resume version management complete
- 50% test coverage

---

### Week 4 (Mar 16 - Mar 22): Polish & Integration

**Goals**: Integrate features, add P1 items, testing blitz

#### Engineering Tasks

- [ ] **SSO Integration**
  - Google OAuth
  - LinkedIn OAuth
  - Account linking
- [ ] **Basic Analytics Dashboard**
  - Key metrics visualization
  - Time-to-hire tracking
  - Pipeline conversion rates
- [ ] **Saved Searches & Job Alerts**
  - Save search queries
  - Alert configuration
  - Email digest generation
- [ ] **PWA Support**
  - Service worker
  - Offline capabilities (basic)
  - Install prompts

#### Product Tasks

- [ ] Analytics dashboard design review
- [ ] Create onboarding flows for new features
- [ ] Prepare launch announcement content
- [ ] Set up help center articles

#### Testing Tasks

- [ ] Integration testing across all new features
- [ ] Load testing (target: 500 concurrent users)
- [ ] Security testing (auth flows, RBAC)
- [ ] Coverage target: 65%

**Deliverables**:

- SSO working
- Analytics dashboard live
- Saved searches functional
- PWA installable
- 65% test coverage

---

### Week 5 (Mar 23 - Mar 29): Quality & Performance

**Goals**: Achieve 70% coverage, performance optimization, bug fixes

#### Engineering Tasks

- [ ] **Test Coverage Sprint**
  - Repository tests (Candidate, Job, Application)
  - Service layer tests
  - API route tests (auth, webhooks, CRUD)
  - Edge case handling
- [ ] **Performance Optimization**
  - API response time improvements
  - Query optimization
  - Cache warming
- [ ] **Bug Fixes**
  - P1 bugs from testing
  - UI/UX polish
  - Mobile responsiveness fixes

#### Product Tasks

- [ ] Beta testing with 5 pilot customers
- [ ] Collect and triage feedback
- [ ] Prioritize P2 features if time permits
- [ ] Prepare launch marketing materials

#### Testing Tasks

- [ ] Complete test suite (target: 70%)
- [ ] Performance testing (p99 < 200ms)
- [ ] Security audit
- [ ] Accessibility testing

**Deliverables**:

- 70% test coverage achieved
- Performance targets met
- Beta feedback incorporated
- Launch marketing ready

---

### Week 6 (Mar 30 - Apr 1): Launch Prep & Go-Live

**Goals**: Final checks, soft launch, public launch

#### Day 1-2 (Mar 30-31): Final Preparations

- [ ] Final code freeze
- [ ] Production deployment dry run
- [ ] Monitoring dashboard setup
- [ ] Runbook review with on-call team
- [ ] Final security scan

#### Day 3 (Apr 1): Soft Launch

- [ ] Deploy to production
- [ ] Enable for 10% of users (feature flags)
- [ ] Monitor metrics closely
- [ ] Standby for hotfixes

#### Day 4 (Apr 2): Public Launch

- [ ] Remove feature flags (100% rollout)
- [ ] Launch announcement
- [ ] Press release
- [ ] Customer notifications
- [ ] Team celebration

**Deliverables**:

- Production deployment successful
- Soft launch completed
- Public launch executed
- Monitoring and support active

---

## Launch Readiness Checklist

### Technical Readiness

- [ ] 70%+ test coverage
- [ ] All P0 features deployed and tested
- [ ] Redis caching operational
- [ ] API rate limiting configured
- [ ] Monitoring and alerting active
- [ ] Runbooks updated
- [ ] Database backups verified
- [ ] Disaster recovery tested

### Product Readiness

- [ ] Interview scheduling working end-to-end
- [ ] In-app messaging functional
- [ ] Interview feedback forms deployed
- [ ] Custom pipeline stages live
- [ ] Application withdrawal available
- [ ] Resume version management working
- [ ] SSO integration complete
- [ ] Basic analytics accessible
- [ ] Help documentation published
- [ ] User guides available

### Marketing Readiness

- [ ] Launch announcement prepared
- [ ] Website updated with new features
- [ ] Pricing page reflects new tiers
- [ ] Demo video created
- [ ] Social media content scheduled
- [ ] PR outreach completed
- [ ] Email campaign ready

### Support Readiness

- [ ] Support team trained on new features
- [ ] FAQ updated
- [ ] Ticket routing configured
- [ ] On-call rotation established
- [ ] Escalation procedures documented

---

## Risk Mitigation

| Risk                            | Impact | Likelihood | Mitigation                                     |
| ------------------------------- | ------ | ---------- | ---------------------------------------------- |
| Test coverage doesn't reach 70% | HIGH   | MEDIUM     | Prioritize critical paths; set 60% as fallback |
| Interview scheduling delayed    | HIGH   | MEDIUM     | Build MVP version; full version post-launch    |
| In-app messaging complexity     | HIGH   | MEDIUM     | Use Pusher/Socket.io managed service           |
| Redis deployment issues         | MEDIUM | LOW        | Use Upstash (managed); local cache fallback    |
| Performance degradation         | HIGH   | LOW        | Load test early; have scaling plan ready       |
| Critical bug in production      | HIGH   | LOW        | Feature flags for rollback; on-call team       |
| Competitor announcement         | MEDIUM | LOW        | Monitor closely; have PR response ready        |

---

## Success Metrics for Launch

### Technical Metrics (Day 1-7)

| Metric          | Target  | Measurement    |
| --------------- | ------- | -------------- |
| Uptime          | 99.9%   | Sentry/Datadog |
| API p99 Latency | < 300ms | APM            |
| Error Rate      | < 1%    | Sentry         |
| Test Coverage   | ≥ 70%   | Vitest report  |
| Cache Hit Rate  | > 60%   | Redis metrics  |

### Product Metrics (Week 1-4)

| Metric                     | Target       | Measurement |
| -------------------------- | ------------ | ----------- |
| New Signups                | 500+         | Database    |
| Interview Scheduling Usage | 50+ bookings | Analytics   |
| Messages Sent              | 200+         | Database    |
| Feedback Forms Submitted   | 100+         | Database    |
| User Retention (Day 7)     | 40%+         | Analytics   |
| NPS Score                  | 30+          | Survey      |

### Business Metrics (Month 1)

| Metric                    | Target  | Measurement |
| ------------------------- | ------- | ----------- |
| Paying Customers          | 20+     | Stripe      |
| MRR                       | $5,000+ | Stripe      |
| Customer Acquisition Cost | <$100   | Marketing   |
| Support Tickets           | < 50    | Zendesk     |
| Churn Rate                | < 10%   | Analytics   |

---

## Post-Launch Roadmap (April - June)

### April (Launch Month)

- Monitor and optimize
- Hotfixes as needed
- Gather user feedback
- Begin P2 feature development

### May (Scale Month)

- Skills assessments
- Mobile app MVP (React Native)
- ATS integration (HiBob)
- Advanced analytics
- Target: 2,000 users, 50 customers

### June (Growth Month)

- Video interview integration
- Bias detection AI
- Diversity sourcing
- Workflow automation
- Target: 5,000 users, 100 customers

---

## Investment Required

### Engineering Resources (6 weeks)

| Role                     | Count | Weeks | Hours | Rate   | Cost        |
| ------------------------ | ----- | ----- | ----- | ------ | ----------- |
| Senior Full-Stack        | 2     | 6     | 480   | $75/hr | $36,000     |
| Mid Full-Stack           | 2     | 6     | 480   | $50/hr | $24,000     |
| Platform Engineer        | 1     | 3     | 120   | $80/hr | $9,600      |
| QA Engineer              | 1     | 4     | 160   | $45/hr | $7,200      |
| **Engineering Subtotal** |       |       |       |        | **$76,800** |

### Infrastructure Costs (Launch Period)

| Service                     | Monthly | 2 Months   |
| --------------------------- | ------- | ---------- |
| Vercel Pro                  | $20     | $40        |
| Supabase (Upgraded)         | $150    | $300       |
| Upstash Redis               | $80     | $160       |
| Pusher (WebSockets)         | $50     | $100       |
| Sentry                      | $26     | $52        |
| Anthropic/OpenAI            | $500    | $1,000     |
| SendGrid/Resend             | $50     | $100       |
| **Infrastructure Subtotal** |         | **$1,752** |

### Third-Party Services

| Service                  | Cost           |
| ------------------------ | -------------- |
| Google Calendar API      | $0 (free tier) |
| LinkedIn OAuth           | $0             |
| Pusher (WebSockets)      | $100           |
| Load Testing (k6 Cloud)  | $200           |
| **Third-Party Subtotal** | **$300**       |

### Marketing & Launch

| Item                   | Cost       |
| ---------------------- | ---------- |
| PR Agency (retainer)   | $3,000     |
| Content Creation       | $1,500     |
| Demo Video Production  | $2,000     |
| Launch Event (virtual) | $500       |
| **Marketing Subtotal** | **$7,000** |

### **Total Launch Investment: ~$85,850**

---

## Daily Standup Template (Launch Sprint)

### Format (15 minutes)

1. **What did you complete yesterday?**
2. **What are you working on today?**
3. **Blockers or risks?**

### Key Questions to Ask Daily

- [ ] Are we on track for 70% coverage?
- [ ] Any P0 features at risk?
- [ ] Any new bugs to prioritize?
- [ ] Do we need to adjust scope?

---

## Communication Plan

### Internal Communications

| Audience          | Frequency | Channel         | Content                  |
| ----------------- | --------- | --------------- | ------------------------ |
| Engineering Team  | Daily     | Standup + Slack | Progress, blockers       |
| Leadership        | Weekly    | Email + Meeting | Status, risks, decisions |
| Company All-Hands | Weekly    | Meeting         | Launch updates           |
| Support Team      | Bi-weekly | Training        | New features             |

### External Communications

| Audience           | Timing | Channel           | Content              |
| ------------------ | ------ | ----------------- | -------------------- |
| Existing Customers | Apr 1  | Email             | New features preview |
| Waitlist           | Apr 2  | Email             | Launch announcement  |
| Press              | Apr 2  | PR Newswire       | Press release        |
| Social Media       | Apr 2  | LinkedIn, Twitter | Launch posts         |
| Blog               | Apr 2  | Company blog      | Launch article       |

---

## Go/No-Go Decision Criteria (March 30)

### GO Criteria (All Must Pass)

- [ ] 65%+ test coverage (70% preferred)
- [ ] All P0 features functional in staging
- [ ] Zero P0 bugs open
- [ ] Performance: p99 < 300ms
- [ ] Security scan: no critical issues
- [ ] Load test passed: 500 concurrent users
- [ ] Monitoring and alerting operational
- [ ] Support team trained and ready
- [ ] Runbooks updated and reviewed
- [ ] Rollback plan documented

### NO-GO Triggers

- Critical security vulnerability discovered
- P0 feature not functional
- Test coverage < 50%
- Performance degradation > 500ms p99
- Database instability in staging

---

## Rollback Plan

### Triggers for Rollback

- Error rate > 5% for 10 minutes
- p99 latency > 1000ms for 15 minutes
- Critical functionality broken
- Security incident
- Database corruption

### Rollback Procedure

1. **Immediate (0-5 min)**
   - Disable feature flags for new features
   - Page on-call engineering lead

2. **Short-term (5-30 min)**
   - Assess if hotfix possible
   - If not, initiate rollback to previous version
   - Communicate to leadership

3. **Communication (parallel)**
   - Status page updated
   - Customer communication prepared
   - Support team notified

4. **Post-rollback**
   - Root cause analysis
   - Fix development
   - Re-deploy when ready

---

## Conclusion

The April 2nd launch is ambitious but achievable. With disciplined execution of this plan, TigerHire will launch with:

1. **Technical Foundation**: 70% test coverage, Redis caching, monitoring
2. **Core Product Features**: Interview scheduling, messaging, feedback forms, custom pipelines
3. **Quality Assurance**: Load tested, security scanned, performance validated
4. **Market Readiness**: Marketing prepared, support trained, customers notified

**Success Probability**: 85% (with committed resources and disciplined execution)

**Next Step**: Kickoff meeting on Feb 23 to align team and begin execution.

---

**Document Version**: 1.0  
**Created**: February 22, 2026  
**Owner**: Product & Engineering Leadership  
**Reviewers**: CTO, CEO, Head of Engineering
