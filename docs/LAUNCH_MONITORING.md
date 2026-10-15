# Launch Monitoring

## Overview

For the April 2nd launch, monitoring focuses on liveness, readiness, dependency health, error rates, and latency. Use this doc to set up dashboards and alerts.

## Health Endpoints

| Endpoint                         | Purpose                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/health`                | Liveness: returns 200 + `{ ok: true }`.                                                       |
| `GET /api/health?ready=1`        | Readiness: 200 if DB reachable, 503 if not.                                                   |
| `GET /api/health?ready=1&deps=1` | Readiness + dependency flags: `deps.stripe`, `deps.anthropic`, `deps.whatsapp`, `deps.redis`. |

Use liveness for process health; use readiness for traffic (e.g. load balancer). Deps are informational; only DB failure drives 503.

## Suggested Alerts

1. **Error rate**
   - Metric: 5xx or 4xx rate (or Sentry error count).
   - Threshold: e.g. > 1% of requests or > N errors/min.
   - Action: Page on-call; check logs and [RUNBOOKS.md](./RUNBOOKS.md).

2. **Latency**
   - Metric: p95 or p99 response time for key routes (e.g. `/api/applications`, `/api/auth/login`).
   - Threshold: e.g. p99 > 300ms (per launch SLO).
   - Action: Check DB, Redis, and external APIs.

3. **Readiness**
   - Metric: `GET /api/health?ready=1` returning 503.
   - Threshold: 1 failure.
   - Action: Runbook “Health check failing”.

4. **Cache hit rate (optional)**
   - If using Redis for caching: track hit rate.
   - Threshold: e.g. < 50% if cache is critical.
   - Action: Review cache keys and TTLs.

## How to configure alerts

Use one or more of the options below so the suggested alerts are actually active.

### Error rate

- **Vercel**: Use Vercel Analytics + optional integration with your alerting (e.g. webhook on error spike).
- **Sentry**: Alerts → Create Alert → "Issues" or "Performance"; set condition e.g. "Error count > 10 in 5m" or "Error rate > 1%"; add notification (email, Slack).
- **Custom**: Poll or scrape `GET /api/health` and your error logs; trigger PagerDuty/Slack when 5xx count or rate exceeds threshold.

### Latency

- **Sentry**: Performance → Create Alert → "Transaction duration" p95 or p99 for routes like `/api/applications`, `/api/auth/login`; threshold e.g. > 300ms.
- **Vercel**: Speed Insights / Analytics for frontend; for API use custom metrics or Sentry.
- **Synthetic checks**: Run a cron that hits key API routes and records latency; alert if p99 exceeds SLO.

### Readiness

- **Vercel**: Add a "Check" or use an external monitor (e.g. Better Uptime, Pingdom) that hits `GET /api/health?ready=1` every 1–5 min; alert on non-200 (or 503).
- **Load balancer**: If you use a LB that supports health checks, point it at `/api/health?ready=1` and remove the instance from rotation on 503.

### Cache hit rate

- **Upstash**: In Upstash Redis dashboard, use the metrics for hit rate (or derive from commands); set up an external alert (e.g. cron script that calls Upstash API and alerts if hit rate < 50%).
- **Application-level**: If you expose cache stats (e.g. from your Redis wrapper), add a small script or Sentry metric that alerts when hit rate drops below threshold.

### Test alert notifications

- Trigger each alert type once (e.g. temporarily lower threshold or force a 503) and confirm the right people get email/Slack/PagerDuty.
- Document the test in [RUNBOOKS.md](./RUNBOOKS.md) so the team can re-run after changes.

## Dashboards

- **Launch dashboard**: Liveness, readiness, deps (from health), error rate, latency, and key business metrics (e.g. applications created, withdrawals).
- **Sentry**: Errors and performance (if integrated); filter by route and environment.
- **Supabase**: DB CPU, connections, slow queries.
- **Upstash Redis** (if used): Commands, hit rate, latency.

## Runbooks

See [RUNBOOKS.md](./RUNBOOKS.md) for health check failure, cost alerts, and auth issues.

## Post-launch

- Review dashboards and alert noise in the first 48 hours.
- Tune thresholds and add runbooks for new failure modes.
