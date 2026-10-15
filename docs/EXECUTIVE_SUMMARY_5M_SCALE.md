# TigerHire: Executive Summary — 5 Million Users Scaling Strategy

## Document Overview

**Technical counterpart:** [SCALE_5M_USERS_ROADMAP.md](./SCALE_5M_USERS_ROADMAP.md) — keep detailed architecture tables and implementation phases there; update that file when engineering execution changes. This document stays the **stakeholder-facing** summary (avoid duplicating the full technical matrix when editing).

This executive summary consolidates two critical analyses for TigerHire's growth:

1. **Technical Scaling**: Architecture required for 5 million concurrent users
2. **Product Feature Gaps**: Features needed for enterprise competitiveness

**Current State**: Beta/Early Launch (~500 concurrent users)
**Target State**: Enterprise-grade platform (5M concurrent users)
**Timeline**: 18 months
**Investment**: $1.5M - $2M + 120 person-weeks

---

## The Challenge: 10,000x Scale Increase

### Current Metrics

- **Concurrent Users**: ~500
- **Requests/Second**: ~100
- **Database**: Single Supabase instance (200 connection limit)
- **Architecture**: Monolithic Next.js on Vercel
- **Caching**: In-memory only (per instance)
- **AI Processing**: Synchronous in-request

### Target Metrics (5M Users)

- **Concurrent Users**: 5,000,000
- **Requests/Second**: 100,000+
- **Database**: Sharded PostgreSQL with 5 read replicas
- **Architecture**: Microservices with API gateway
- **Caching**: Redis Cluster + CDN + Multi-layer
- **AI Processing**: Async queue-based (SQS + Lambda)

### Scale Factor: 10,000x

This is not an incremental improvement — it requires fundamental architectural changes across all layers.

---

## Critical Path to 5M Users

### Phase 1: Foundation (Months 1-3) — $200K

**Goal**: Support 100K concurrent users

| Component       | Current       | Target        | Action                    |
| --------------- | ------------- | ------------- | ------------------------- |
| Caching         | In-memory Map | Redis Cluster | Deploy ElastiCache        |
| DB Connections  | 200 direct    | 10,000 pooled | PgBouncer + read replicas |
| API Gateway     | None          | Kong/AWS      | Implement rate limiting   |
| Background Jobs | In-process    | SQS + Lambda  | Queue-based architecture  |
| Monitoring      | Basic         | Datadog       | Full observability        |

**Key Deliverables:**

- ✅ Redis cluster operational
- ✅ 3 read replicas deployed
- ✅ API gateway with tiered rate limits
- ✅ SQS queues for all background jobs
- ✅ Load testing framework (k6)
- ✅ CI/CD pipeline improvements

**Risk if Skipped**: Database will crash at ~2,000 concurrent users

---

### Phase 2: Queue & Async (Months 4-6) — $300K

**Goal**: Support 500K concurrent users, 50K requests/sec

| Component  | Current     | Target        | Action                    |
| ---------- | ----------- | ------------- | ------------------------- |
| AI Agents  | In-request  | Lambda async  | Move to serverless        |
| Embeddings | Synchronous | Batch queues  | SQS batch processing      |
| FitScore   | Real-time   | Async + cache | Pre-compute scores        |
| Webhooks   | Synchronous | EventBridge   | Event-driven architecture |
| Search     | Supabase    | Elasticsearch | Dedicated search cluster  |

**Key Deliverables:**

- ✅ AI agents running in Lambda (1000 concurrent)
- ✅ FitScore cache hit rate > 80%
- ✅ Elasticsearch cluster for candidate search
- ✅ Event-driven architecture with EventBridge
- ✅ Circuit breakers on all external APIs

**Risk if Skipped**: AI service throttling will cause cascading failures

---

### Phase 3: Multi-Region (Months 7-9) — $400K

**Goal**: Support 1M concurrent users, global availability

| Component      | Current    | Target                           | Action                  |
| -------------- | ---------- | -------------------------------- | ----------------------- |
| Regions        | 1 (Mumbai) | 3 (Mumbai, Singapore, Frankfurt) | Multi-region deploy     |
| Data Residency | None       | Per-tenant                       | Regional data isolation |
| CDN            | None       | CloudFront                       | Edge caching            |
| Load Balancing | Vercel     | Route53 geo                      | Geographic routing      |
| DR             | None       | Active-passive                   | Cross-region failover   |

**Key Deliverables:**

- ✅ Singapore region live
- ✅ Frankfurt region live
- ✅ Data residency compliance
- ✅ < 100ms latency for users in each region
- ✅ RTO < 15 minutes, RPO < 1 minute

**Risk if Skipped**: International expansion blocked; compliance violations

---

### Phase 4: Sharding & Microservices (Months 10-12) — $500K

**Goal**: Support 2M concurrent users, enterprise scale

| Component     | Current              | Target                 | Action                |
| ------------- | -------------------- | ---------------------- | --------------------- |
| Database      | Single               | Sharded (Citus)        | Tenant-based sharding |
| Architecture  | Monolithic           | Microservices          | Service decomposition |
| API           | 60 routes in Next.js | API Gateway + Services | Service-oriented      |
| Cache         | Redis                | Redis Cluster + CDN    | Multi-layer           |
| Vector Search | pgvector             | Pinecone               | Dedicated vector DB   |

**Key Deliverables:**

- ✅ Database sharding by organisation_id
- ✅ 8 microservices deployed
- ✅ Pinecone for 50M+ vector queries
- ✅ Service mesh (App Mesh)
- ✅ Zero-downtime deployments

**Risk if Skipped**: Cannot scale beyond 1M users with current architecture

---

### Phase 5: Optimization (Months 13-18) — $300K

**Goal**: Support 5M concurrent users, 99.99% SLA

| Component         | Current  | Target             | Action               |
| ----------------- | -------- | ------------------ | -------------------- |
| Autoscaling       | Manual   | Fully automated    | K8s + KEDA           |
| ML Models         | Basic    | Optimized          | Model distillation   |
| Edge Computing    | None     | CloudFront Workers | Edge functions       |
| Chaos Engineering | None     | Weekly drills      | Resilience testing   |
| Capacity Planning | Reactive | Predictive         | ML-based forecasting |

**Key Deliverables:**

- ✅ Auto-scaling to 5M users
- ✅ 99.99% uptime maintained
- ✅ < 200ms p99 latency globally
- ✅ SOC 2 Type II certified
- ✅ Chaos engineering program

---

## Total Investment Breakdown

### Infrastructure Costs (Monthly at 5M Users)

| Service                         | Monthly Cost        |
| ------------------------------- | ------------------- |
| AWS Compute (ECS/Fargate)       | $15,000             |
| AWS Aurora (Primary + Replicas) | $25,000             |
| AWS ElastiCache (Redis)         | $8,000              |
| AWS OpenSearch                  | $12,000             |
| Pinecone (Vector DB)            | $5,000              |
| AWS S3 + CloudFront             | $5,000              |
| AWS SQS/EventBridge             | $2,000              |
| Vercel Enterprise               | $3,000              |
| DataDog Monitoring              | $5,000              |
| Anthropic/OpenAI APIs           | $20,000             |
| **Total Infrastructure**        | **~$100,000/month** |

### Development Costs (One-time)

| Phase                  | Duration      | Team Size    | Cost        |
| ---------------------- | ------------- | ------------ | ----------- |
| Phase 1: Foundation    | 3 months      | 6 engineers  | $180K       |
| Phase 2: Queue & Async | 3 months      | 8 engineers  | $240K       |
| Phase 3: Multi-Region  | 3 months      | 8 engineers  | $240K       |
| Phase 4: Sharding      | 3 months      | 10 engineers | $300K       |
| Phase 5: Optimization  | 6 months      | 6 engineers  | $360K       |
| **Total Development**  | **18 months** |              | **~$1.32M** |

### Additional Costs

| Item                         | Cost       |
| ---------------------------- | ---------- |
| SOC 2 Type II Audit          | $50K       |
| Load Testing Tools           | $20K       |
| Security Penetration Testing | $30K       |
| Training & Documentation     | $20K       |
| Contingency (15%)            | $210K      |
| **Total Additional**         | **~$330K** |

### **Grand Total: ~$1.65M over 18 months**

---

## Product Feature Gaps Summary

### Must-Have for 100K Users (Immediate - 3 months)

| Feature                   | Gap Level | Impact | Effort  |
| ------------------------- | --------- | ------ | ------- |
| Interview Scheduling      | CRITICAL  | 10/10  | 4 weeks |
| In-App Messaging          | CRITICAL  | 10/10  | 3 weeks |
| Interview Feedback Forms  | CRITICAL  | 10/10  | 2 weeks |
| Custom Pipeline Stages    | CRITICAL  | 9/10   | 3 weeks |
| SSO & 2FA                 | CRITICAL  | 9/10   | 2 weeks |
| Resume Version Management | HIGH      | 8/10   | 2 weeks |
| Skills Assessments        | HIGH      | 8/10   | 4 weeks |
| Mobile Apps               | HIGH      | 8/10   | 8 weeks |

### Required for 1M Users (6 months)

| Feature             | Gap Level | Impact | Effort  |
| ------------------- | --------- | ------ | ------- |
| ATS Integrations    | CRITICAL  | 10/10  | 6 weeks |
| Advanced Analytics  | HIGH      | 9/10   | 4 weeks |
| Video Interview     | HIGH      | 9/10   | 3 weeks |
| Workflow Automation | HIGH      | 8/10   | 4 weeks |
| Bias Detection      | HIGH      | 8/10   | 3 weeks |
| Diversity Sourcing  | HIGH      | 8/10   | 2 weeks |

### Enterprise-Ready (12 months)

| Feature            | Gap Level | Impact | Effort   |
| ------------------ | --------- | ------ | -------- |
| SOC 2 Compliance   | CRITICAL  | 10/10  | 12 weeks |
| Advanced RBAC      | HIGH      | 9/10   | 4 weeks  |
| Audit Logs         | HIGH      | 9/10   | 2 weeks  |
| Custom Data Fields | HIGH      | 8/10   | 3 weeks  |
| SCIM Provisioning  | MEDIUM    | 7/10   | 3 weeks  |
| Background Checks  | MEDIUM    | 7/10   | 2 weeks  |

---

## Competitive Positioning

### TigerHire Unique Differentiators

1. **AI FitScore with Explainability** — No competitor provides transparent scoring
2. **WhatsApp-First India Strategy** — Meeting candidates where they are
3. **Intent Signal Detection** — Finding candidates before they apply
4. **Bias-Reduced Matching** — Ethical AI differentiation

### Gaps vs LinkedIn

| Area              | LinkedIn          | TigerHire     | Gap      |
| ----------------- | ----------------- | ------------- | -------- |
| Network Effects   | ✅ Strong         | ❌ None       | Critical |
| Global Reach      | ✅ 200+ countries | ❌ India only | High     |
| Content Platform  | ✅ Strong         | ❌ None       | Medium   |
| Mobile App        | ✅ Excellent      | ❌ None       | Critical |
| Brand Recognition | ✅ Universal      | ❌ Unknown    | High     |

### Gaps vs Greenhouse/Lever

| Area                | Greenhouse  | TigerHire    | Gap      |
| ------------------- | ----------- | ------------ | -------- |
| ATS Integration     | ✅ 100+     | ⚠️ 3 planned | High     |
| Interview Tools     | ✅ Suite    | ❌ None      | Critical |
| Analytics           | ✅ Advanced | ⚠️ Basic     | High     |
| Enterprise Features | ✅ Complete | ❌ Minimal   | Critical |

---

## Risk Analysis

### Technical Risks

| Risk                   | Probability | Impact   | Mitigation                              |
| ---------------------- | ----------- | -------- | --------------------------------------- |
| Database cannot scale  | High        | Critical | Early sharding + read replicas          |
| AI service throttling  | Medium      | High     | Circuit breakers + fallback models      |
| Cache stampede         | Medium      | High     | Cache warming + staggered TTL           |
| Multi-region data sync | Medium      | Medium   | Async replication + conflict resolution |
| Cold start latency     | Medium      | Medium   | Provisioned concurrency                 |

### Product Risks

| Risk                            | Probability | Impact   | Mitigation                       |
| ------------------------------- | ----------- | -------- | -------------------------------- |
| Feature parity with competitors | High        | High     | Prioritize gaps by user feedback |
| Mobile adoption                 | Medium      | High     | Invest heavily in mobile UX      |
| Enterprise sales cycle          | High        | Medium   | Build self-serve onboarding      |
| Network effects (chicken-egg)   | High        | Critical | Seed both sides of marketplace   |

### Business Risks

| Risk                  | Probability | Impact   | Mitigation                           |
| --------------------- | ----------- | -------- | ------------------------------------ |
| Burn rate too high    | Medium      | Critical | Phased investment tied to milestones |
| Key person dependency | Medium      | High     | Documentation + cross-training       |
| Market timing         | Low         | High     | Maintain agility, watch indicators   |

---

## Key Milestones & Gates

### Gate 1: Launch Readiness (Month 3)

**Criteria:**

- [ ] 100 concurrent users with < 200ms latency
- [ ] Interview scheduling live
- [ ] In-app messaging working
- [ ] Zero critical security issues
- [ ] 60+ test coverage

### Gate 2: Product-Market Fit (Month 6)

**Criteria:**

- [ ] 10,000 registered users
- [ ] 50 paying customers
- [ ] 4.0+ NPS score
- [ ] < 5% monthly churn
- [ ] 100K requests/day sustained

### Gate 3: Scale Validation (Month 9)

**Criteria:**

- [ ] 100K concurrent users
- [ ] 99.9% uptime for 30 days
- [ ] Multi-region deployment
- [ ] 500 paying customers
- [ ] $50K MRR

### Gate 4: Enterprise Ready (Month 12)

**Criteria:**

- [ ] SOC 2 Type II certification
- [ ] 10 enterprise customers
- [ ] 1M concurrent users capacity
- [ ] 5 ATS integrations live
- [ ] $200K MRR

### Gate 5: Market Leadership (Month 18)

**Criteria:**

- [ ] 5M registered users
- [ ] 1M concurrent users sustained
- [ ] #1 in India hiring market
- [ ] 40% market share (AI hiring)
- [ ] $1M MRR

---

## Recommended Immediate Actions (Next 30 Days)

### Week 1: Technical Foundation

- [ ] Set up Redis cluster (Upstash for quick start)
- [ ] Configure Supabase connection pooling
- [ ] Implement API rate limiting
- [ ] Deploy health check improvements

### Week 2: Critical Features

- [ ] Start interview scheduling implementation
- [ ] Design in-app messaging architecture
- [ ] Begin mobile app research (React Native vs native)
- [ ] SSO provider selection (Auth0 vs WorkOS)

### Week 3: Infrastructure

- [ ] Set up load testing environment (k6)
- [ ] Configure SQS for one background job
- [ ] Implement circuit breaker on Anthropic API
- [ ] Add monitoring for external APIs

### Week 4: Product & Process

- [ ] User interviews for feature prioritization
- [ ] Define interview feedback form requirements
- [ ] Create custom pipeline stage mockups
- [ ] Plan Phase 1 technical architecture review

---

## Success Metrics Dashboard

### Technical Metrics (Daily)

- API p99 latency
- Error rate (%)
- Cache hit rate (%)
- DB connection pool utilization
- Queue depth

### Product Metrics (Weekly)

- Active users (DAU/MAU)
- Feature adoption rates
- User satisfaction (NPS)
- Time-to-hire (average)
- Match quality (FitScore accuracy)

### Business Metrics (Monthly)

- MRR and ARR
- Customer acquisition cost (CAC)
- Lifetime value (LTV)
- Churn rate
- Net revenue retention

---

## Conclusion

Scaling TigerHire to 5 million concurrent users is an ambitious but achievable goal. The path requires:

1. **Technical Excellence**: Fundamental architecture changes over 18 months
2. **Product Completeness**: Closing critical feature gaps for enterprise competitiveness
3. **Operational Maturity**: SOC 2, multi-region, enterprise-grade reliability
4. **Investment**: ~$1.65M over 18 months with disciplined execution

**The window of opportunity is now.** The India hiring market is ripe for disruption, and TigerHire's AI-first approach provides a genuine differentiator. However, competitors are not standing still — execution speed will determine market leadership.

**Next Step**: Approve Phase 1 funding ($200K) and begin Redis cluster implementation immediately.

---

**Document Version**: 1.0  
**Last Updated**: February 22, 2026  
**Prepared By**: AI Systems Architect  
**Review Required**: CTO, CEO, Head of Product
