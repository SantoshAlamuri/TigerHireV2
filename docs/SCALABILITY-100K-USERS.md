# Scalability: What Happens at 100k Users

This document describes **what happens** when TigerHire reaches **100,000 users** (concurrent or registered) and how to prepare. It complements the [5M Scale Roadmap](./SCALE_5M_USERS_ROADMAP.md), which covers much larger scale.

## Defining “100k Users”

- **100k registered users**: Total accounts (candidates, recruiters, company admins). Daily active users might be 5–20% (5k–20k).
- **100k concurrent users**: 100k simultaneous connections/sessions. This is a **stress scenario** (e.g. viral traffic or a load test).

The sections below cover both: **sustained load from 100k registered** and **spikes toward 100k concurrent**.

---

## 1. What Happens Today at 100k-Scale Load

### Application (Next.js / Vercel)

- **Serverless functions**: Each request can spin up a new instance. At 100k concurrent, you hit **Vercel’s concurrency limits** (plan-dependent). Queueing and cold starts increase latency.
- **Edge/ISR**: Static and cached pages (e.g. public marketing) scale well; API routes and dynamic pages are limited by function concurrency and timeouts (e.g. 10–60s depending on plan).
- **Result**: Under heavy concurrent load, some requests will queue, time out, or return 5xx if dependencies (DB, Redis) are saturated.

### Database (Supabase / Postgres)

- **Connections**: Postgres has a finite `max_connections` (often 60–200 on Supabase depending on plan). Each serverless invocation can use one or more connections; at 100k concurrent you **exhaust connections** without a pooler.
- **Rate limit table**: The app uses a DB-backed rate limiter (`rate_limit_log`, `check_rate_limit_atomic`). At very high request rates this table **grows quickly** and the RPC + count queries add load and latency.
- **Result**: Connection errors, slow queries, and eventually 503s or timeouts when the DB is overloaded.

### Redis (Upstash)

- **REST API**: Upstash uses HTTP, so there are no connection limits like Postgres. Limits are on **requests per second** and **data size** (see your plan).
- **Use in TigerHire**: Auth profile cache, optional response caching. If request volume is huge, you may hit **Upstash throughput limits**; the app degrades gracefully (cache miss, more DB hits).
- **Result**: At 100k concurrent, cache hit rate may drop and DB load increases if Redis is throttled.

### Rate Limiting

- **Current**: Atomic Postgres function + `rate_limit_log` table. Accurate but **DB-heavy** at very high RPS.
- **Result**: At 100k concurrent, rate-limit checks add significant DB load; consider moving to **Redis-backed** rate limiting for high traffic.

### Third-Party Services

- **Anthropic / OpenAI**: Token and RPM limits; heavy AI usage will throttle.
- **Resend**: Email sending limits per plan.
- **Stripe**: Generally handles high volume; webhook idempotency and retries matter.
- **Result**: Feature-specific degradation (e.g. “AI slow” or “email delayed”), not necessarily full site outage.

---

## 2. Summary: What Breaks First at 100k Concurrent

| Component     | Likely failure mode at 100k concurrent |
| ------------- | -------------------------------------- |
| Vercel/Next   | Concurrency limit, queueing, timeouts  |
| Supabase      | Connection exhaustion, slow queries    |
| Rate limiting | DB overload from rate_limit_log + RPC  |
| Upstash Redis | Throughput limit (plan-dependent)      |
| External APIs | Throttling (Anthropic, Resend, etc.)   |

---

## 3. Recommendations Before Reaching 100k

### Must-have (to avoid outages)

1. **Connection pooling**
   - Use **Supabase Pooler** (or PgBouncer) so serverless functions share a limited pool (e.g. 50–200 connections) instead of one connection per invocation.
   - Configure the app to use the **pooler connection string** for serverless.

2. **Redis-backed rate limiting**
   - For high RPS, move rate-limit state to **Upstash Redis** (or similar) so the database is not hit on every request. Keep a DB fallback if Redis is down.
   - See [ADR-004: atomic rate limiting](./ADR-004-atomic-rate-limiting.md).

3. **Caching**
   - Use Redis (and/or CDN) for:
     - Auth profile (already used when Redis is configured).
     - Public job lists and heavy read paths.
   - Reduces DB and API load as you grow.

4. **Health and limits**
   - Use `GET /api/health?ready=1&deps=1` in your deployment and alerts.
   - Set **realistic rate limits** per user/API key so a single tenant cannot overwhelm the system.

### Should-have (for stability and cost)

5. **Load and stress tests**
   - Run **k6** (or similar) regularly: `k6 run load/stress.js` and `load/smoke.js` (see [load/README.md](../load/README.md)).
   - Test against staging with **Supabase Pooler** and Redis enabled; simulate 1k–10k VUs and compare with baseline.

6. **Observability**
   - Use existing **Sentry** and logs; add metrics for:
     - DB connection pool usage and query latency.
     - Redis hit/miss and latency.
     - Rate-limit rejections and RPC latency.
   - See [OBSERVABILITY_SETUP.md](./OBSERVABILITY_SETUP.md).

7. **Database**
   - Indexes on hot paths (jobs, applications, profiles, `rate_limit_log` by key and time).
   - Optional: **read replica** for heavy read queries if Supabase plan supports it.

### Plan for growth beyond 100k

- For **much larger scale** (e.g. 5M users), follow the [SCALE_5M_USERS_ROADMAP.md](./SCALE_5M_USERS_ROADMAP.md) (sharding, read replicas, multi-region, etc.).

---

## 4. Running a “100k User” Stress Test

- **Interpretation**: “100k users” in a test usually means **100k virtual users (VUs)** in k6, which can generate far more than 100k RPS depending on think time and script.
- **Suggested steps**:
  1. Run **smoke** then **stress** against staging: `k6 run load/smoke.js`, `k6 run load/stress.js`.
  2. Increase VUs gradually (e.g. 100 → 500 → 1000) and watch:
     - `GET /api/health?ready=1&deps=1` (and cache/deps in response).
     - DB and Redis metrics in Supabase/Upstash dashboards.
     - Error rate and p95/p99 latency in k6.
  3. Optionally run the **npm**-based stress script (no k6 install): `npm run test:stress` (hits homepage with autocannon).

This will show where the system fails first (DB, Redis, or app concurrency) so you can prioritize pooling, caching, and rate limiting.
