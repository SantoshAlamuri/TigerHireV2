# Observability Setup Guide

## Phase 6 checklist (dashboard + SLOs)

When you add a dedicated observability dashboard (Grafana, Datadog, or Vercel Analytics + Sentry):

1. **Define 1–2 SLOs** (e.g. p99 latency &lt; 2s for `/api/health`, error rate &lt; 0.1%).
2. **Single dashboard** with: error rate, latency percentiles, queue depth (if using a job queue), and cost (agent_logs).
3. **Runbook**: Who is paged for what (see [RUNBOOKS.md](./RUNBOOKS.md)); what to check first (health, Supabase, Stripe).

---

## Current State

TigerHire currently has basic observability in place:

- **Error Tracking**: Sentry for error monitoring and stack traces
- **Analytics**: PostHog for user behavior and product analytics
- **Structured Logging**: JSON logger (`src/lib/observability/logger.ts`) with PII redaction
- **Correlation IDs**: `x-request-id` header set in `src/middleware.ts` for request tracing

## Correlation IDs

### Current Implementation

Correlation IDs are set in the middleware (`src/middleware.ts`):

```typescript
const requestId = crypto.randomUUID();
requestHeaders.set("x-request-id", requestId);
```

### Required Improvements

**Propagation**: The `x-request-id` header must be propagated to all service calls:

1. **External API Calls**: Include `x-request-id` in headers for Stripe, Resend, Apify, Anthropic
2. **Database Queries**: Log correlation ID with Supabase queries (via logger context)
3. **Background Jobs**: Pass correlation ID through agent runs and async operations

**Implementation Pattern**:

```typescript
// In API routes
const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

// In service calls
await resilientCall(async () => {
  return await fetch(externalApi, {
    headers: {
      "x-request-id": requestId,
    },
  });
});

// In logger calls
logger.info("Operation completed", {
  correlation_id: requestId,
  // ... other context
});
```

## Recommended Dashboards

### Platform: Grafana Cloud or Datadog

Both platforms offer:

- Time-series metrics
- Log aggregation
- Alerting
- Custom dashboards

**Recommendation**: Start with Grafana Cloud (free tier available) or Datadog (if already using for other services).

### Dashboard Panels

#### 1. Request Metrics

- **Request Rate**: Requests per second by endpoint
- **Error Rate**: 4xx and 5xx errors per second
- **Latency**: p50, p95, p99 response times
- **Status Code Distribution**: Pie chart of 200/400/500/etc.

**Data Source**: Application logs (parse structured JSON) or APM tool

#### 2. Circuit Breaker State

- **Circuit State per Service**: Open/Closed/Half-Open for Stripe, Resend, Apify, Anthropic
- **Failure Count**: Failures per service (triggers circuit opening)
- **Recovery Time**: Time to circuit recovery

**Data Source**: Application logs (circuit breaker events)

**Implementation**: Add circuit breaker state changes to logger:

```typescript
logger.info("Circuit breaker opened", {
  service: "stripe",
  failure_count: 5,
  correlation_id: requestId,
});
```

#### 3. Agent Cost Tracking

- **Daily Agent Cost**: Total cost in INR per day
- **Cost per Agent**: Breakdown by agent (Talent Scout, Hiring Signal, FitScore)
- **Token Usage**: Tokens consumed per agent
- **Cost Trend**: 7-day and 30-day trends

**Data Source**: Agent logs (`agent_logs` table) with `cost_inr` and `tokens_used` fields

**Query Example**:

```sql
SELECT
  DATE(created_at) as date,
  agent_name,
  SUM(cost_inr) as total_cost,
  SUM(tokens_used) as total_tokens
FROM agent_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), agent_name
ORDER BY date DESC;
```

#### 4. Database Metrics

- **Connection Pool Usage**: Active connections / max connections
- **Query Latency**: p50/p95/p99 query execution time
- **Slow Queries**: Queries taking > 1 second
- **Transaction Rate**: Transactions per second

**Data Source**: Supabase dashboard or PostgreSQL metrics exporter

#### 5. Rate Limiting

- **Rate Limit Hits**: Requests blocked by rate limiting per key
- **Fallback Usage**: Count of fallback rate limit checks (indicates RPC issues)

**Data Source**: Application logs (rate limit warnings)

#### 6. Cache Performance

- **Cache Hit Rate**: Redis cache hits / (hits + misses)
- **Cache Evictions**: Keys evicted due to memory pressure
- **Cache Latency**: Redis operation latency

**Data Source**: Redis metrics (if using Redis Cloud or self-hosted with metrics)

## Alerting

### SLO-Based Alerts (Recommended)

Use **SLO burn rate** alerts to catch degradation early:

**Example SLO**: 99% of requests complete in < 500ms

**Alert Rules**:

- **Page Alert**: Burn rate > 14.4 (violates SLO in 6 hours)
- **Ticket Alert**: Burn rate > 6 (violates SLO in 24 hours)

**Implementation**: Use Grafana Alerting or Datadog SLO monitoring

### Alert Channels

- **Slack**: Primary channel for on-call alerts
- **PagerDuty**: For critical alerts (P1/P2)
- **Email**: For informational alerts

### Alert Examples

1. **High Error Rate**: Error rate > 5% for 5 minutes
2. **Circuit Breaker Open**: Any circuit breaker opens
3. **High Latency**: p95 latency > 2 seconds for 5 minutes
4. **Database Connection Exhaustion**: Connection pool > 80% for 5 minutes
5. **Agent Cost Spike**: Daily agent cost > 2x average for 3 days

## Implementation Checklist

### Phase 1: Correlation ID Propagation

- [ ] Add `x-request-id` to all external API calls
- [ ] Include correlation ID in all logger calls
- [ ] Pass correlation ID through agent runs
- [ ] Add correlation ID to database query logs

### Phase 2: Metrics Collection

- [ ] Set up Grafana Cloud or Datadog account
- [ ] Configure log aggregation (Loki or Datadog Logs)
- [ ] Create dashboard with request metrics
- [ ] Add circuit breaker state logging
- [ ] Export agent cost metrics

### Phase 3: Alerting

- [ ] Define SLOs for critical endpoints
- [ ] Set up SLO burn rate alerts
- [ ] Configure Slack integration
- [ ] Test alert delivery

### Phase 4: Advanced Observability

- [ ] Add distributed tracing (OpenTelemetry)
- [ ] Set up APM (Application Performance Monitoring)
- [ ] Create custom dashboards for business metrics
- [ ] Implement log retention policies

## References

- Logger implementation: `src/lib/observability/logger.ts`
- Middleware: `src/middleware.ts`
- Agent logs: `src/lib/agents/*.ts`
- Circuit breaker: `src/lib/utils/circuit-breaker.ts`
- Rate limiting: `src/lib/security/rate-limit.ts`

---

## Supabase SQL: preview and launch monitoring

Run in the Supabase SQL Editor (LLM cost and latency from `llm_call_logs`):

### 1) Daily LLM cost by purpose and model

```sql
select
  date_trunc('day', created_at) as day,
  purpose,
  model,
  round(sum(coalesce(cost_usd, 0)), 4) as cost_usd,
  count(*) as calls
from public.llm_call_logs
where created_at >= now() - interval '14 days'
group by 1, 2, 3
order by day desc, cost_usd desc;
```

### 2) LLM latency p50/p95/p99 by purpose

```sql
select
  purpose,
  count(*) as calls,
  percentile_cont(0.50) within group (order by latency_ms) as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_ms,
  percentile_cont(0.99) within group (order by latency_ms) as p99_ms
from public.llm_call_logs
where created_at >= now() - interval '7 days'
group by purpose
order by p95_ms desc;
```

### 3) LLM error rate by purpose

```sql
select
  purpose,
  status,
  count(*) as calls,
  round(100.0 * count(*) / nullif(sum(count(*)) over (partition by purpose), 0), 2) as pct
from public.llm_call_logs
where created_at >= now() - interval '7 days'
group by purpose, status
order by purpose, calls desc;
```

_(Previously a separate file; folded here so observability is one place.)_
