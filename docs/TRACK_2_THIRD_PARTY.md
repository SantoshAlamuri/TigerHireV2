# Track 2: Third Party — Subagent Work Plan

> **Owner:** Infrastructure / DevOps subagent
> **Priority:** P1–P2
> **Pending tasks:** ~8
> **Depends on:** Account credentials and dashboard access for external services

---

## TASK 2.1 — Upstash Redis Production Setup (P1)

**Goal:** Provision a production Upstash Redis instance and configure credentials.

### Context

- Redis client: `src/lib/redis/client.ts` — uses `@upstash/redis` with REST API
- Env vars needed: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Env config: `src/lib/config/env.ts` (lines 51–55)
- Redis is optional — `getRedis()` returns `null` if not configured
- Used for: rate limiting (`src/lib/security/rate-limit.ts`), caching (`src/lib/redis/cache.ts`), auth profile cache (`src/lib/redis/auth-profile-cache.ts`)

### Steps

1. **Create Upstash account** at https://console.upstash.com
2. **Create a new Redis database:**
   - Name: `tigerhire-production`
   - Region: Choose closest to Vercel deployment region (e.g., `us-east-1` for Vercel's default)
   - Plan: Pay-as-you-go (or Pro for guaranteed throughput)
   - Enable TLS
   - Enable eviction policy: `allkeys-lru`
3. **Copy credentials:**
   - `UPSTASH_REDIS_REST_URL` → the REST API endpoint
   - `UPSTASH_REDIS_REST_TOKEN` → the REST API token
4. **Set env vars in production:**
   - Vercel: Project Settings → Environment Variables → add both for Production + Preview
   - Or `.env.production` (do NOT commit)
5. **Verify connectivity:**

```bash
curl -X POST <UPSTASH_REDIS_REST_URL>/set/test/hello \
  -H "Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>"

curl <UPSTASH_REDIS_REST_URL>/get/test \
  -H "Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>"
```

6. **Clean up test key:**

```bash
curl -X POST <UPSTASH_REDIS_REST_URL>/del/test \
  -H "Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>"
```

### Configuration Recommendations

| Setting    | Value          | Reason                                   |
| ---------- | -------------- | ---------------------------------------- |
| Max memory | 256 MB (start) | Sufficient for cache + rate limits       |
| Eviction   | `allkeys-lru`  | Auto-evict least-recently-used when full |
| Region     | Same as Vercel | Minimize latency                         |
| TLS        | Enabled        | Required for production                  |

### Acceptance

- [x] Upstash Redis database created
- [x] Credentials set in Vercel env vars
- [x] `checkRedis()` returns `true` in production
- [ ] Rate limiting works in production (verify after next deploy)

---

## TASK 2.2 — Supabase Connection Pooling (P1)

**Goal:** Enable connection pooling to handle 500+ concurrent users without exhausting DB connections.

### Context

- Supabase clients: `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/client.ts`
- Current connection: Direct connection to Supabase PostgreSQL
- Supabase provides Supavisor (built-in connection pooler) at port 6543

### Steps

1. **Enable Supavisor in Supabase Dashboard:**
   - Go to Project Settings → Database → Connection Pooling
   - Enable connection pooling (Supavisor)
   - Note the pooled connection string (port 6543 instead of 5432)
   - Pool mode: **Transaction** (recommended for serverless)
   - Pool size: 15 (default, adjust based on load testing)

2. **Update connection strings:**
   - For server-side: Use the **pooled** connection string
   - For migrations/admin: Keep the **direct** connection string
   - In Vercel env vars:
     - `DATABASE_URL` → pooled connection string (port 6543)
     - `DIRECT_URL` → direct connection string (port 5432)

3. **Verify the Supabase JS client automatically uses pooling:**
   - The `@supabase/supabase-js` client uses the REST API (PostgREST), which already goes through Supavisor
   - No code changes needed if using the JS client exclusively
   - Only relevant if any code uses `pg` or direct PostgreSQL connections

4. **Monitoring:**
   - Supabase Dashboard → Database → Connections — watch active connections
   - Set alert if active connections exceed 80% of pool size

### Configuration Recommendations

| Setting           | Value       | Reason                                                            |
| ----------------- | ----------- | ----------------------------------------------------------------- |
| Pool mode         | Transaction | Best for serverless (connections returned after each transaction) |
| Pool size         | 15          | Default; increase to 25 if load tests show connection waits       |
| Statement timeout | 30s         | Prevent runaway queries                                           |
| Idle timeout      | 60s         | Free idle connections                                             |

### Acceptance

- [x] Connection pooling enabled in Supabase dashboard (Supavisor active by default; app uses REST API via JS client)
- [x] Pooled connection string configured in production (N/A — no direct pg connections; all traffic via PostgREST/Supavisor)
- [ ] No connection exhaustion under 500 concurrent users (verify with load tests)

---

## TASK 2.3 — Monitoring Services (P0)

**Goal:** Confirm Sentry error tracking is live, dashboards work, alerts fire correctly.

_Execute March 30–31_

### Context

- Observability: `src/lib/observability/` — `logger.ts`, `metrics.ts`, `alerts.ts`, `report-error.ts`
- Check if Sentry is already integrated (look for `@sentry/nextjs` in `package.json`)

### Steps

1. **Confirm Sentry integration:**
   - Check `package.json` for `@sentry/nextjs`
   - If not present, install and configure:

```bash
npx @sentry/wizard@latest -i nextjs
```

- Verify `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` exist
- Set `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` in Vercel env vars
- Test: throw a test error in a route and verify it appears in Sentry dashboard

2. **Verify monitoring dashboards:**
   - Supabase Dashboard: Database metrics, API metrics, Auth metrics
   - Vercel Dashboard: Deployment logs, function logs, Web Analytics
   - Upstash Dashboard: Redis metrics (after Task 2.1)
   - Sentry Dashboard: Error tracking, performance monitoring

3. **Test alerts:**
   - Sentry: Configure alert for error rate > 10/min
   - Supabase: Enable email alerts for high database CPU / connection saturation
   - Vercel: Enable deployment failure notifications
   - Upstash: Enable alerts for memory > 80%

### Acceptance

- [ ] Sentry captures errors in production
- [ ] All 4 dashboards accessible and showing data
- [ ] At least 3 alert rules configured and tested

---

## TASK 2.4 — Communication Channels (P0)

**Goal:** Set up Slack infrastructure for launch coordination and incident response.

_Execute March 30–31_

### Steps

1. **Create Slack channels:**

| Channel                | Purpose                               | Members               |
| ---------------------- | ------------------------------------- | --------------------- |
| `#tigerhire-launch`    | Launch day coordination               | All team              |
| `#tigerhire-incidents` | Incident response                     | Engineering + on-call |
| `#tigerhire-alerts`    | Automated alerts from Sentry/Supabase | Bots + Engineering    |
| `#tigerhire-support`   | Customer support escalations          | Support + Engineering |

2. **Configure integrations:**
   - Sentry → Slack: Send alerts to `#tigerhire-alerts`
   - Vercel → Slack: Send deployment notifications to `#tigerhire-alerts`
   - Supabase → Slack: Send database alerts (if supported, otherwise use email → Slack bridge)

3. **Create channel bookmarks:**
   - Link to Sentry dashboard
   - Link to Supabase dashboard
   - Link to Vercel dashboard
   - Link to RUNBOOKS.md
   - Link to incident response template

4. **Test notification flow:**
   - Trigger a test error → verify Slack alert arrives in `#tigerhire-alerts`
   - Post a test message in `#tigerhire-incidents` to verify all members can see it

### Acceptance

- [ ] 4 Slack channels created
- [ ] Sentry → Slack integration working
- [ ] Vercel → Slack integration working
- [ ] All team members added to relevant channels

---

## TASK 2.5 — Integrations: Nice to Have (P2)

**Goal:** Add Google Calendar and WhatsApp integrations for interview scheduling.

### 2.5a Google Calendar Integration

**Context:**

- Interview scheduling API: `src/app/api/jobs/[id]/interviews/`
- Booking creates a record in the database; currently no external calendar sync
- WhatsApp service already exists: `src/lib/services/whatsapp.ts`

**Steps:**

1. Create Google Cloud project or use existing
2. Enable Google Calendar API
3. Create OAuth2 credentials (or service account for server-to-server)
4. Install `googleapis` package:

```bash
npm install googleapis
```

5. Create `src/lib/services/google-calendar.ts`:
   - `createCalendarEvent(params)` — creates event with attendees
   - `cancelCalendarEvent(eventId)` — cancels event
   - `rescheduleCalendarEvent(eventId, newTime)` — updates event

6. Call from interview booking/cancel/reschedule API routes
7. Store `google_calendar_event_id` on the interview record

### 2.5b WhatsApp Reminders

**Context:**

- WhatsApp service: `src/lib/services/whatsapp.ts`
- WhatsApp templates: `src/lib/whatsapp/templates.ts`
- WhatsApp handler: `src/lib/whatsapp/handler.ts`

**Steps:**

1. Create a new WhatsApp message template for interview reminders (in Meta Business Manager)
2. Add template to `src/lib/whatsapp/templates.ts`
3. Create a cron job `src/app/api/cron/interview-reminders/route.ts`:
   - Query interviews scheduled in next 24 hours
   - Send WhatsApp reminder to candidates who have a WhatsApp number
   - Respect `interview_reminders` email preference

### Acceptance

- [ ] Google Calendar events created/cancelled/rescheduled on interview actions
- [ ] WhatsApp reminders sent 24 hours before interviews
- [ ] Both gated by user preferences

---

**End of Track 2 Plan**
