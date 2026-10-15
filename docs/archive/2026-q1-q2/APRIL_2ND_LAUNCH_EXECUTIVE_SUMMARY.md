# TigerHire April 2nd Launch - Executive Summary

## TL;DR

**Launch Date**: April 2, 2026  
**Status**: Technically Ready (Grade B, 77/100)  
**Investment**: ~$86K over 6 weeks  
**Team**: 6 engineers + support  
**Confidence**: 85%

---

## What We're Launching

### Core Product (What's New)

1. **Interview Scheduling** — Candidates and recruiters book interviews directly
2. **In-App Messaging** — Real-time communication between candidates & recruiters
3. **Interview Feedback Forms** — Structured scorecards for hiring decisions
4. **Custom Pipeline Stages** — Recruiters define their own hiring workflows
5. **Resume Version Management** — Candidates manage multiple resume versions

### Platform Improvements

- 70% test coverage (up from 5-10%)
- Redis caching for performance
- SSO (Google, LinkedIn)
- Basic analytics dashboard
- PWA support for mobile

---

## 6-Week Sprint at a Glance

```
Week 1    Week 2    Week 3    Week 4    Week 5    Week 6    🚀
Feb 23    Mar 2     Mar 9     Mar 16    Mar 23    Mar 30    Apr 2
  |         |         |         |         |         |         |
  ▼         ▼         ▼         ▼         ▼         ▼         ▼
Redis    Interview In-App    SSO &    Test     Final   Public
Setup    Scheduling Messaging Analytics  Blitz   Checks  Launch
         + Pipeline + Feedback + Saved
                    + Resume   Searches
```

---

## Key Metrics

### Current State (Feb 22)

- Users: ~500 concurrent
- Test Coverage: 5-10%
- Features: Basic job matching, WhatsApp, Stripe billing

### Launch Target (Apr 2)

- Users: ~2,000 concurrent capacity
- Test Coverage: 70%
- New Features: 8 P0 features
- NPS Target: 30+

### 30-Day Post-Launch Goals

- 500 new signups
- 50 paying customers
- $5,000 MRR
- 40% Day-7 retention

---

## Resource Requirements

| Role                | Count | Duration | Investment  |
| ------------------- | ----- | -------- | ----------- |
| Senior Engineers    | 2     | 6 weeks  | $36,000     |
| Mid-Level Engineers | 2     | 6 weeks  | $24,000     |
| Platform Engineer   | 1     | 3 weeks  | $9,600      |
| QA Engineer         | 1     | 4 weeks  | $7,200      |
| Marketing/PR        | -     | Launch   | $7,000      |
| Infrastructure      | -     | 2 months | $2,052      |
| **TOTAL**           | **6** |          | **$85,852** |

---

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation                                 |
| ----------------------- | ---------- | ------ | ------------------------------------------ |
| Test coverage shortfall | Medium     | High   | Prioritize critical paths; 60% acceptable  |
| Feature delays          | Medium     | High   | MVP versions; post-launch completion       |
| Performance issues      | Low        | High   | Load testing Week 4; Redis caching         |
| Critical bug in prod    | Low        | High   | Feature flags; on-call team; rollback plan |

---

## Go/No-Go Decision (March 30)

### ✅ GO if:

- 65%+ test coverage
- All P0 features functional
- Zero critical bugs
- p99 latency < 300ms
- 500 concurrent user load test passed

### ❌ NO-GO if:

- Coverage < 50%
- Critical security issue
- Database instability
- P0 feature broken

---

## Post-Launch Priorities (April-June)

**April**: Monitor, hotfix, gather feedback  
**May**: Mobile app, skills assessments, ATS integration  
**June**: Video interviews, AI bias detection, automation

---

## Questions & Decisions Needed

### Immediate (by Feb 23)

1. [ ] Approve $86K budget
2. [ ] Confirm 6 engineer allocation
3. [ ] Approve feature scope (P0 vs P1)
4. [ ] Set daily standup time

### Week 2 (by Mar 8)

5. [ ] Select WebSocket provider (Pusher vs Socket.io)
6. [ ] Approve calendar integration (Google only vs +Outlook)
7. [ ] Confirm SSO providers (Google + LinkedIn?)

### Week 4 (by Mar 22)

8. [ ] Beta customer selection (5 pilot companies)
9. [ ] Pricing confirmation for new tiers
10. [ ] PR agency engagement

---

## Competitive Position at Launch

| Feature              | TigerHire | LinkedIn | Naukri | Greenhouse |
| -------------------- | --------- | -------- | ------ | ---------- |
| AI FitScore          | ✅        | ⚠️       | ❌     | ❌         |
| Interview Scheduling | ✅        | ✅       | ❌     | ✅         |
| In-App Messaging     | ✅        | ❌       | ❌     | ✅         |
| WhatsApp Integration | ✅        | ❌       | ❌     | ❌         |
| Custom Pipelines     | ✅        | ❌       | ❌     | ✅         |
| Mobile App           | ⚠️ PWA    | ✅       | ✅     | ✅         |
| ATS Integration      | ⚠️ Coming | ✅       | ⚠️     | ✅         |

**Key Differentiators**: AI FitScore + WhatsApp-first India strategy + Messaging

---

## Daily Standup

**Time**: 9:00 AM IST  
**Format**: 15 minutes  
**Questions**:

1. What did you complete yesterday?
2. What are you working on today?
3. Any blockers or risks?

**Key Tracking**:

- Test coverage %
- P0 feature status
- Open bugs count
- Scope changes

---

## Communication Cadence

| Audience    | When    | What                    |
| ----------- | ------- | ----------------------- |
| Engineering | Daily   | Standup + Slack updates |
| Leadership  | Weekly  | Status email + meeting  |
| All-Hands   | Weekly  | Launch progress         |
| Customers   | Apr 1-2 | Launch announcement     |
| Press       | Apr 2   | Press release           |

---

## Document Links

- [Full Launch Plan](./APRIL_2ND_LAUNCH_PLAN.md)
- [Product Feature Gaps](./PRODUCT_FEATURE_GAPS.md)
- [Production Readiness Audit](./PRODUCTION_READINESS_AUDIT_V2.md)
- [5M User Scaling Roadmap](./SCALE_5M_USERS_ROADMAP.md)
- [Runbooks](./RUNBOOKS.md)
- [SLOs](./SLOs.md)

---

**Prepared**: February 22, 2026  
**Owner**: Product & Engineering Leadership  
**Next Review**: February 23, 2026 (Kickoff)
