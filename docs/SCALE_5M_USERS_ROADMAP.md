# TigerHire: 5 Million Concurrent Users Scaling Roadmap

**Also read:** [EXECUTIVE_SUMMARY_5M_SCALE.md](./EXECUTIVE_SUMMARY_5M_SCALE.md) — business narrative, investment framing, and phased deliverables. This roadmap file stays focused on **technical** architecture and milestones.

## Executive Summary

Scaling from current architecture (50K users) to **5 million concurrent users** requires a fundamental architectural transformation. This represents a **100x scale increase** that demands changes across infrastructure, data architecture, caching, and application design.

**Estimated Timeline**: 12-18 months  
**Investment Required**: 80-120 person-weeks  
**Architecture Grade Required**: A+ (95+/100)

---

## Current State vs 5M Target

| Metric               | Current | 5M Target | Gap        |
| -------------------- | ------- | --------- | ---------- |
| Concurrent Users     | ~500    | 5,000,000 | 10,000x    |
| Requests/Second      | ~100    | 100,000+  | 1,000x     |
| Database Connections | 50      | 50,000+   | 1,000x     |
| Data Storage         | ~100GB  | 50TB+     | 500x       |
| Regions              | 1       | 5-10      | 5-10x      |
| Availability SLA     | 99.9%   | 99.99%    | 10x better |

---

## Critical Architecture Changes Required

### 1. Database Layer (P0 - Critical)

#### 1.1 Connection Pooling & Management

```
Current: Direct Supabase connections (max 200)
Target:  PgBouncer/Supabase connection pooling (50,000+)
```

**Implementation:**

- Migrate to Supabase Pooler or self-managed PgBouncer
- Implement connection multiplexing (1,000:1 ratio)
- Add connection circuit breakers
- Read replica strategy for query distribution

#### 1.2 Read Replicas & Query Distribution

```sql
-- Current: Single primary database
-- Target: 1 Primary + 5 Read Replicas

-- Write operations → Primary (us-east-1)
-- Read operations → Nearest replica
-- AI/ML queries → Dedicated analytics replica
```

**Schema Changes:**

```sql
-- Add read-only indicators to queries
SELECT /* read-only */ * FROM candidates WHERE ...

-- Partition large tables
CREATE TABLE candidates_2024 PARTITION OF candidates
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

#### 1.3 Database Sharding Strategy

**Shard Key Decision**: `organisation_id` (tenant-based sharding)

```
Shard 1: organisations A-M (50K tenants)
Shard 2: organisations N-Z (50K tenants)
Shard 3: Candidates/Signals (global data)
Shard 4: Analytics/Reporting
```

**Implementation:**

- Use Citus extension for PostgreSQL sharding
- Cross-shard queries via coordinator node
- Async replication between shards

### 2. Caching Architecture (P0 - Critical)

#### 2.1 Redis Cluster Implementation

```
Current: In-memory Map (per instance, 60s TTL)
Target: Redis Cluster (6 nodes, 3 masters + 3 replicas)
```

**Caching Strategy:**

| Data Type       | Cache Strategy   | TTL   |
| --------------- | ---------------- | ----- |
| User Sessions   | Redis Hash       | 24h   |
| Feature Flags   | Redis String     | 5min  |
| Rate Limits     | Redis Sorted Set | 1min  |
| FitScores       | Redis JSON       | 1h    |
| Candidate Lists | Redis List       | 15min |
| Job Postings    | Redis Hash       | 30min |
| API Responses   | Redis JSON       | 5min  |

#### 2.2 Multi-Layer Caching

```
┌─────────────────────────────────────────┐
│           CDN (CloudFront)              │  Edge Cache
│     Static assets, public jobs          │  24h TTL
├─────────────────────────────────────────┤
│         API Gateway Cache                 │  Regional
│    Common queries, rate limit state       │  5min TTL
├─────────────────────────────────────────┤
│         Redis Cluster                     │  Application
│   Sessions, feature flags, fitscores      │  Variable TTL
├─────────────────────────────────────────┤
│         Application Cache                 │  In-Memory
│    Circuit breaker state, hot data        │  60s TTL
└─────────────────────────────────────────┘
```

### 3. API & Application Layer (P1 - High)

#### 3.1 API Gateway Implementation

**Replace direct Vercel Functions with API Gateway:**

```yaml
# AWS API Gateway / Kong / Tyk
api_gateway:
  rate_limiting:
    - tier: free
      requests: 100/hour
    - tier: starter
      requests: 1000/hour
    - tier: growth
      requests: 10000/hour
    - tier: scale
      requests: 100000/hour

  caching:
    enabled: true
    ttl: 300

  load_balancing:
    strategy: round_robin
    health_checks: true
```

#### 3.2 Microservices Decomposition

**Current:** Monolithic Next.js app (60 API routes, 74 lib modules)

**Target:** Service-oriented architecture

```
services/
├── api-gateway/          # Kong/AWS API Gateway
├── auth-service/         # Supabase Auth + custom
├── candidate-service/    # Candidate CRUD, search
├── job-service/          # Job postings, matching
├── fitscore-service/     # AI scoring (compute-heavy)
├── notification-service/ # Email, WhatsApp, Slack
├── billing-service/      # Stripe, subscriptions
├── analytics-service/    # Reporting, metrics
└── admin-service/        # Internal tools
```

#### 3.3 Serverless vs Container Strategy

| Service         | Current          | Target               | Strategy      |
| --------------- | ---------------- | -------------------- | ------------- |
| Web Frontend    | Vercel           | Vercel + Edge        | Static + ISR  |
| API Routes      | Vercel Functions | ECS/Fargate          | Containers    |
| AI Agents       | In-process       | Lambda + SQS         | Async         |
| Embeddings      | In-process       | SageMaker            | GPU instances |
| Background Jobs | Vercel Cron      | EventBridge + Lambda | Scheduled     |

### 4. Queue & Background Processing (P0 - Critical)

#### 4.1 Message Queue Architecture

**Current:** In-process with DLQ (fire-and-forget)

**Target:** AWS SQS + EventBridge + Lambda

```
Queues:
├── high-priority.fifo        # Real-time notifications
├── fitscore-standard         # AI scoring jobs
├── embedding-batch           # Batch embedding generation
├── whatsapp-outbound         # WhatsApp messages
├── email-outbound            # Email notifications
├── dlq-main                  # Dead letter queue
└── scheduled-cron          # Cron job triggers
```

#### 4.2 Event-Driven Architecture

```typescript
// Event bus for decoupled services
interface DomainEvent {
  eventId: string;
  eventType: "candidate.created" | "job.posted" | "fitscore.completed";
  timestamp: string;
  payload: unknown;
  metadata: {
    correlationId: string;
    userId: string;
    organisationId: string;
  };
}

// Event handlers
const handlers: Record<string, Handler[]> = {
  "candidate.created": [new EmbeddingHandler(), new NotificationHandler(), new AnalyticsHandler()],
  "fitscore.completed": [new NotificationHandler(), new CacheInvalidationHandler()],
};
```

### 5. Search & Discovery (P1 - High)

#### 5.1 Elasticsearch/OpenSearch Integration

**Current:** Supabase full-text search + pgvector

**Target:** Hybrid search architecture

```
Search Tiers:
├── Primary: Elasticsearch (text search, filtering)
├── Secondary: pgvector (semantic/embedding search)
└── Fallback: Supabase (basic queries)
```

**Index Design:**

```json
{
  "candidates": {
    "properties": {
      "name": { "type": "text", "analyzer": "standard" },
      "skills": { "type": "keyword" },
      "location": { "type": "keyword" },
      "experience_years": { "type": "integer" },
      "intent_score": { "type": "float" },
      "embedding": { "type": "dense_vector", "dims": 1536 },
      "organisation_id": { "type": "keyword" }
    }
  }
}
```

#### 5.2 Vector Search at Scale

**Current:** pgvector with IVFFlat (thousands of vectors)

**Target:** Dedicated vector database

```
Options:
1. Pinecone (managed, recommended)
2. Weaviate (self-hosted)
3. Milvus (open source)
4. pgvector with HNSW (if staying with Postgres)
```

**Migration Strategy:**

```typescript
// Gradual migration
const vectorSearch = async (query: number[]) => {
  // 90% traffic to Pinecone
  if (Math.random() < 0.9) {
    return pinecone.query(query);
  }
  // 10% to pgvector for validation
  return pgvector.query(query);
};
```

### 6. Multi-Region Architecture (P1 - High)

#### 6.1 Regional Deployment

```
Regions:
├── Primary: Mumbai (ap-south-1)     # India focus
├── Secondary: Singapore (ap-southeast-1)  # SE Asia
├── Tertiary: Frankfurt (eu-central-1)     # Europe
└── DR: US-East (us-east-1)         # Disaster recovery
```

#### 6.2 Data Residency & Compliance

```sql
-- Data residency by tenant
ALTER TABLE organisations ADD COLUMN data_region VARCHAR(20);

-- RLS policies updated
CREATE POLICY tenant_isolation ON candidates
  USING (
    organisation_id IN (
      SELECT id FROM organisations
      WHERE data_region = current_setting('app.current_region')
    )
  );
```

#### 6.3 Global Load Balancing

```
Route53 Geolocation Routing:
├── India → Mumbai (ap-south-1)
├── SE Asia → Singapore (ap-southeast-1)
├── Europe → Frankfurt (eu-central-1)
└── Default → Mumbai (primary)
```

---

## Infrastructure Changes

### 1. Compute Scaling

| Component  | Current     | 5M Target                      | Technology    |
| ---------- | ----------- | ------------------------------ | ------------- |
| Web Tier   | Vercel Pro  | Vercel Enterprise + CloudFront | Edge network  |
| API Tier   | Serverless  | ECS Fargate (50 tasks)         | Containers    |
| AI Workers | In-process  | Lambda (1000 concurrent)       | Serverless    |
| Background | Vercel Cron | EventBridge + Step Functions   | Orchestration |

### 2. Storage Scaling

| Component    | Current          | 5M Target            | Strategy                 |
| ------------ | ---------------- | -------------------- | ------------------------ |
| Database     | Supabase 500GB   | 50TB sharded         | Read replicas + sharding |
| File Storage | Supabase Storage | S3 + CloudFront      | Object storage           |
| Cache        | In-memory        | Redis Cluster 100GB  | Distributed              |
| Search       | Supabase         | Elasticsearch 10TB   | Dedicated cluster        |
| Vectors      | pgvector         | Pinecone 50M vectors | Vector DB                |

### 3. Networking

```
CDN: CloudFront / Cloudflare
WAF: AWS WAF / Cloudflare
DDoS: AWS Shield Advanced
API Gateway: Kong / AWS API Gateway
Service Mesh: AWS App Mesh (optional)
```

---

## Performance Targets

### API Response Times (p99)

| Endpoint              | Current | 5M Target     |
| --------------------- | ------- | ------------- |
| GET /api/health       | 50ms    | 20ms          |
| POST /api/auth/login  | 200ms   | 100ms         |
| GET /api/candidates   | 500ms   | 200ms         |
| GET /api/jobs         | 300ms   | 150ms         |
| POST /api/fitscore    | 3000ms  | 1000ms        |
| GET /api/fitscore/:id | 500ms   | 50ms (cached) |

### Throughput Targets

| Metric                 | Target     |
| ---------------------- | ---------- |
| API Requests/Second    | 100,000    |
| Concurrent Users       | 5,000,000  |
| FitScores/Hour         | 1,000,000  |
| Embeddings/Day         | 10,000,000 |
| WhatsApp Messages/Hour | 500,000    |

---

## Migration Phases

### Phase 1: Foundation (Months 1-3)

- [ ] Implement Redis caching cluster
- [ ] Set up read replicas
- [ ] Add connection pooling
- [ ] Implement API gateway
- [ ] Load testing framework (k6)

### Phase 2: Queue & Async (Months 4-6)

- [ ] Migrate to SQS/EventBridge
- [ ] Move AI agents to Lambda
- [ ] Implement event-driven architecture
- [ ] Add comprehensive monitoring
- [ ] Multi-region preparation

### Phase 3: Search & Analytics (Months 7-9)

- [ ] Elasticsearch cluster
- [ ] Vector database (Pinecone)
- [ ] Analytics pipeline
- [ ] Data warehouse (Snowflake/BigQuery)
- [ ] Real-time dashboards

### Phase 4: Multi-Region (Months 10-12)

- [ ] Singapore region deployment
- [ ] Data residency compliance
- [ ] Global load balancing
- [ ] Cross-region replication
- [ ] Disaster recovery testing

### Phase 5: Optimization (Months 13-18)

- [ ] Database sharding
- [ ] Microservices decomposition
- [ ] Advanced caching strategies
- [ ] ML model optimization
- [ ] Performance tuning

---

## Cost Estimates (Monthly at 5M Users)

| Component                | Provider | Monthly Cost       |
| ------------------------ | -------- | ------------------ |
| Compute (ECS)            | AWS      | $15,000            |
| Database (Aurora)        | AWS      | $25,000            |
| Redis (ElastiCache)      | AWS      | $8,000             |
| Search (OpenSearch)      | AWS      | $12,000            |
| Vectors (Pinecone)       | Pinecone | $5,000             |
| CDN (CloudFront)         | AWS      | $3,000             |
| AI/ML (Anthropic/OpenAI) | Vendors  | $20,000            |
| Queues (SQS/EventBridge) | AWS      | $2,000             |
| Monitoring (Datadog)     | Datadog  | $5,000             |
| **Total**                |          | **~$95,000/month** |

---

## Risk Assessment

| Risk                   | Probability | Impact   | Mitigation                             |
| ---------------------- | ----------- | -------- | -------------------------------------- |
| Database overload      | High        | Critical | Read replicas, sharding, caching       |
| AI service throttling  | Medium      | High     | Circuit breakers, fallback models      |
| Cache stampede         | Medium      | High     | Cache warming, staggered TTL           |
| Multi-region data sync | Medium      | Medium   | Async replication, conflict resolution |
| Cold start latency     | Medium      | Medium   | Provisioned concurrency, warming       |

---

## Success Metrics

### Technical KPIs

- [ ] p99 API latency < 200ms
- [ ] 99.99% uptime SLA
- [ ] < 0.1% error rate
- [ ] 100K requests/second capacity
- [ ] 5M concurrent users supported

### Business KPIs

- [ ] Zero data loss
- [ ] < 5min MTTR for critical issues
- [ ] Global availability (3+ regions)
- [ ] GDPR/CCPA compliance
- [ ] SOC 2 Type II certification

---

## Next Steps

1. **Immediate (Week 1)**
   - Set up Redis cluster (Upstash/AWS ElastiCache)
   - Configure read replicas
   - Implement connection pooling

2. **Short-term (Month 1)**
   - Deploy API gateway
   - Migrate to SQS for background jobs
   - Add comprehensive load testing

3. **Medium-term (Months 2-3)**
   - Elasticsearch integration
   - Multi-region preparation
   - Performance optimization

---

**Document Version**: 1.0  
**Last Updated**: February 22, 2026  
**Owner**: Platform Engineering Team
