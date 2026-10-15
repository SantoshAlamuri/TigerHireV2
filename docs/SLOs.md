# Service Level Objectives (SLOs)

Targets for production. Use these to set alerting and error budgets.

## Availability

| SLO       | Target                         | Measurement                                     |
| --------- | ------------------------------ | ----------------------------------------------- |
| Uptime    | ≥ 99.9%                        | Successful GET /api/health over rolling 30 days |
| Readiness | DB and critical deps available | GET /api/health?ready=1 returns 200             |

## Latency

| SLO     | Target   | Measurement                                       |
| ------- | -------- | ------------------------------------------------- |
| API p50 | < 200 ms | Server-side duration for authenticated API routes |
| API p95 | < 500 ms | Same                                              |
| API p99 | < 2 s    | Same                                              |

## Errors

| SLO                    | Target | Measurement                                         |
| ---------------------- | ------ | --------------------------------------------------- |
| Error rate             | < 0.5% | 5xx responses / total API requests (rolling window) |
| Failed background jobs | < 1%   | DLQ inserts / total async operations                |

## Error budget

- **Budget**: 0.1% unavailable = ~43 minutes/month at 99.9%.
- **Burn rate**: Alert when error rate or latency SLO burn exceeds 2x in 1 hour (e.g. 2x 0.5% error rate for 1h).
- **Actions**: When budget is exhausted, freeze non-essential releases and focus on reliability.

## Dashboards and alerts

- Wire availability and latency to your observability stack (Sentry, Datadog, or Grafana).
- Set alerts for SLO burn rate and for readiness probe failures.
