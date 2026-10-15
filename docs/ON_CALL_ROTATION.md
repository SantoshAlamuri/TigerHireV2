# On-Call Rotation & Escalation

## Overview

24/7 on-call coverage for production incidents. Initial rotation covers IST business hours with best-effort after-hours coverage.

## Rotation Schedule

| Week            | Primary On-Call | Secondary (Escalation) |
| --------------- | --------------- | ---------------------- |
| Week 1          | Engineer A      | Engineering Lead       |
| Week 2          | Engineer B      | Engineering Lead       |
| (rotate weekly) |                 |                        |

### Shift Hours

- **Primary**: IST 09:00 - 21:00 (Mon-Fri), best-effort on weekends
- **Escalation**: Available 24/7 for SEV-1/SEV-2

## Severity Levels

| Level     | Description                                     | Response SLA      | Examples                                               |
| --------- | ----------------------------------------------- | ----------------- | ------------------------------------------------------ |
| **SEV-1** | Full outage, data loss, security breach         | 15 min            | Site down, DB corruption, credential leak              |
| **SEV-2** | Partial outage, degraded service for many users | 30 min            | Payment failures, auth broken, agent errors            |
| **SEV-3** | Non-critical issue, workaround available        | 4 hours           | Slow queries, non-blocking UI bugs, single-user issues |
| **SEV-4** | Minor issue, no user impact                     | Next business day | Log noise, cosmetic bugs, docs                         |

## Escalation Path

```
Alert fires (Sentry/Health check/Slack)
    |
    v
Primary On-Call (15 min to acknowledge)
    |
    v (no response or SEV-1)
Secondary On-Call / Engineering Lead
    |
    v (no response or > 1 hour unresolved)
CTO / Founder
```

## Tools

- **Alerting**: Sentry (errors), Uptime monitor (health check), Slack #alerts
- **Incident channel**: Create `#incident-YYYY-MM-DD` in Slack
- **Runbooks**: See `docs/DR_RUNBOOK.md` and `docs/RUNBOOKS.md`
- **Status page**: Update if customer-facing impact > 5 minutes

## On-Call Responsibilities

1. **Acknowledge** alerts within the response SLA
2. **Triage** severity and open an incident channel if SEV-1 or SEV-2
3. **Investigate** using logs (Sentry), health endpoint, database queries
4. **Resolve or escalate** -- don't spend > 30 min stuck without escalating
5. **Communicate** status updates every 30 min in the incident channel
6. **Post-mortem** within 3 business days for SEV-1/SEV-2 (see `docs/DR_RUNBOOK.md`)

## Handoff Process

- End of shift: Post summary of any active issues in #on-call Slack channel
- Weekly: Review previous week's incidents in team standup
- Monthly: Review on-call load and adjust rotation if needed
