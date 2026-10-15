# Enterprise Code Quality & Production Readiness Audit

**Context**: AI-generated code audit per checklist. Focus: AI hallucination, security, reliability, observability.

**Audit date**: 2025-02-22  
**Scope**: `src/`, `supabase/schema/`, config and env usage.

---

## Executive Summary

| Category         | P0  | P1  | P2  | P3  |
| ---------------- | --- | --- | --- | --- |
| AI Hallucination | 0   | 0   | 1   | 1   |
| Security         | 0   | 1   | 2   | 1   |
| Reliability      | 0   | 2   | 4   | 2   |
| Observability    | 0   | 0   | 1   | 1   |
| Config/Env       | 0   | 1   | 0   | 0   |

**Critical**: No P0 issues. **Action required**: Address P1 items (contact route success-on-DB-failure, missing `.env.example`) and high-value P2 items.

---

## 1. AI Hallucination & Fabrication

### 1.1 Fake APIs / Methods — **PASS**

- **Check**: Imports and external calls verified.
- **Evidence**: Supabase client methods (`from()`, `select()`, `insert()`, etc.) match `@supabase/supabase-js`. Stripe `webhooks.constructEvent` is correct. No invented APIs found.

### 1.2 Non-existent environment variables — **P1**

- **Detection**: All `process.env.*` usages collected; no single source of truth for required vars.
- **Evidence**: `src/lib/config/env.ts` and scattered `process.env` use (e.g. `CRON_SECRET`, `NEXT_PUBLIC_TEST_PASSWORD`, `WAITLIST_COUNT_SEED`, `KV_REST_API_URL`, etc.).
- **Impact**: New environments (staging, production) may miss variables; runtime failures or insecure defaults.
- **Fix**: Add `.env.example` documenting every variable (see section 6).
- **Verification**: `diff <(grep -roh 'process\.env\.\w+' src | sort -u) <(grep -E '^[A-Z_]+=' .env.example | cut -d= -f1 | sort)` — all code vars present in example.

### 1.3 Database schemas — **PASS**

- **Check**: `rate_limit_log` (key, created_at), `feature_flags`, `notifications`, etc. referenced in code exist in `supabase/schema/` (e.g. `36_rate_limit_and_flags.sql`).
- **Note**: No migrations folder with sequential migrations; schema is file-based. Confirm deployment applies these.

### 1.4 Dependency drift — **P2**

- **Detection**: Two rate-limit implementations with different APIs and stores.
- **Evidence**:
  - `@/lib/rate-limit`: `checkRateLimit(key, config)` → `{ success, limit, remaining, resetAt }`; uses MemoryStore or KV (Upstash/Vercel KV).
  - `@/lib/security/rate-limit`: `checkRateLimit({ key, limit, windowSecs })` → `{ allowed, remaining, resetAt }`; uses Supabase `rate_limit_log`.
- **Impact**: Confusion, inconsistent limits across routes (auth/register/signals use old; applications/fit-score/webhooks use new). Possible double-counting or gaps.
- **Fix**: Unify on one implementation (e.g. security/rate-limit + Supabase) and migrate all call sites to same API; remove or deprecate `lib/rate-limit.ts`.
- **Verification**: Single import path for `checkRateLimit`; one shared config (e.g. named limits).

---

## 2. "Confidently Wrong" Code Patterns

### 2.1 Contact route: success on DB failure — **P1**

- **Category**: Reliability / AI pattern (optimistic response).
- **Location**: `src/app/api/contact/route.ts` (lines 26–46).
- **Evidence**: On `admin.from("contact_submissions").insert()` error, code only `console.error`s and still returns `200` with "Thanks — we'll get back...".
- **Impact**: User believes message was stored; support/ops have no record.
- **Fix**: On insert error, return `jsonError("We couldn't save your message. Please try again or contact us via WhatsApp.", 500)` and do not send success response.
- **Verification**: Unit test or manual: mock DB to fail → assert status 500 and no success message.

### 2.2 Unhandled promise rejections (employee dashboards) — **P2**

- **Category**: Reliability.
- **Location**: `src/app/(dashboard)/employee/my-referrals/page.tsx` (lines 30–34), `src/app/(dashboard)/employee/refer/page.tsx` (lines 24–28).
- **Evidence**: `fetch(...).then(...).then(...).finally(...)` with no `.catch()`. If `fetch` or `r.json()` fails, promise rejects unhandled.
- **Impact**: Unhandled rejection in browser; loading state may never clear; poor UX.
- **Fix**: Add `.catch(() => setReferrals([]))` (or setError) and optionally set an error state for UI.
- **Verification**: DevTools → disable network and reload; assert no unhandled rejection and UI shows empty or error state.

### 2.3 Silent catch in contact route — **P2**

- **Category**: Reliability.
- **Location**: `src/app/api/contact/route.ts` line 48.
- **Evidence**: `catch { return NextResponse.json({ error: "..." }, { status: 500 }); }` — no logging.
- **Impact**: 500s are invisible in app logs if only `console` is used; harder to debug.
- **Fix**: Use `logger.error("Contact form failed", { error: String(err) });` before returning 500 (and fix success-on-insert above).
- **Verification**: Trigger validation/JSON error; confirm log line appears.

### 2.4 NotificationDropdown: optimistic PATCH, silent failure — **P2**

- **Category**: Reliability.
- **Location**: `src/components/dashboard/NotificationDropdown.tsx` line 101.
- **Evidence**: `fetch(..., { method: "PATCH", ... }).catch(() => {});` — marks notification as read in UI regardless of server success.
- **Impact**: If PATCH fails, UI shows "read" but server still has unread; sync drift.
- **Fix**: Prefer: `.then(res => { if (!res.ok) revert local state; }).catch(() => revert local state)` or at least surface a subtle toast on failure.
- **Verification**: Throttle or mock 500 on PATCH; assert unread count or badge can revert.

### 2.5 Rate limit race (security/rate-limit) — **P2**

- **Category**: Reliability / Security.
- **Location**: `src/lib/security/rate-limit.ts` (count-then-insert).
- **Evidence**: Logic: read count, if &lt; limit then insert. Two concurrent requests can both see count &lt; limit and both insert.
- **Impact**: Limit can be exceeded by 1 (or more under concurrency).
- **Fix**: Prefer atomic increment (e.g. single `INSERT` + count in same window, or Redis INCR). Or document as "best effort" and rely on stricter limits elsewhere.
- **Verification**: Load test with concurrent requests at limit boundary; check DB count vs expected.

### 2.6 Admin PATCH log field name — **P3**

- **Category**: Observability (semantic clarity).
- **Location**: `src/app/api/admin/users/route.ts` line 76.
- **Evidence**: `logger.info("Admin role update", { user_id: userId, message: role });` — `message` is the new role value.
- **Impact**: Log queries by "message" are misleading; not a bug.
- **Fix**: Use `new_role: role` or `role` in meta.
- **Verification**: Search logs for "Admin role update" and confirm field meaning.

---

## 3. Security

### 3.1 Stripe webhook — **PASS**

- **Check**: Signature verification with `stripe.webhooks.constructEvent(body, sig, env.stripeWebhookSecret)` before processing. Rejects on invalid sig (400).
- **Evidence**: `src/app/api/webhooks/stripe/route.ts` lines 16–23.

### 3.2 Auth context — **PASS**

- **Check**: `getAuthContext()` uses `supabase.auth.getUser()` and profiles table for role/organisation; no fake JWT verification.
- **Evidence**: `src/lib/api-helpers.ts`.

### 3.3 Invite token — **PASS**

- **Check**: Invite tokens use `crypto.randomBytes(32).toString("hex")` (cryptographically secure).
- **Evidence**: `src/app/api/organisations/members/route.ts` line 62.

### 3.4 RunId for agents — **P2**

- **Location**: `src/lib/agents/types.ts` line 16.
- **Evidence**: `runId: \`${agentName}_${Date.now()}\_${Math.random().toString(36).slice(2, 8)}\``.
- **Impact**: Not used for security; only for idempotency/correlation. Low risk.
- **Fix**: Optional: use `crypto.randomBytes(4).toString('hex')` for slightly more uniqueness; not P0.

### 3.5 Test credentials in login — **P2**

- **Location**: `src/app/(auth)/login/page.tsx`, `NEXT_PUBLIC_TEST_PASSWORD`, test account visibility.
- **Evidence**: Gated by `NODE_ENV === "development"` or `NEXT_PUBLIC_SHOW_TEST_ACCOUNTS === "true"`.
- **Impact**: If `NEXT_PUBLIC_SHOW_TEST_ACCOUNTS` is set in production, test accounts could be exposed.
- **Fix**: Ensure production builds never set `NEXT_PUBLIC_SHOW_TEST_ACCOUNTS=true`; document in `.env.example`.

### 3.6 CORS — **PASS**

- **Check**: No wildcard `Access-Control-Allow-Origin: *` with credentials in codebase.

---

## 4. Observability

### 4.1 Inconsistent logging — **P2**

- **Detection**: Many routes still use `console.error` instead of `logger`.
- **Evidence**: Grep for `console.error` in `src/`: 30+ files (e.g. `api/candidates/[id]/unlock/route.ts`, `api/auth/seed-demo-users/route.ts`, `api/auth/login/route.ts`, `lib/services/notifications.ts`, cron routes, stripe webhook, etc.).
- **Impact**: In production, stdout may be captured but structure (e.g. `logger.error("...", { error })`) is better for log pipelines; mixed style reduces queryability.
- **Fix**: Replace `console.error` with `logger.error` in API routes and services; keep logger in dev using console if desired (already in `logger.ts`).
- **Verification**: Deploy and run a failing path; confirm single structured log format.

### 4.2 TODO in production path — **P3**

- **Location**: `src/lib/observability/alerts.ts` line 21.
- **Evidence**: `// TODO: integrate Slack webhook or Resend email for production alerts`.
- **Impact**: Cost alerts only logged; no actionable alerting.
- **Fix**: Implement Slack/Resend integration or remove TODO and document "alerts via log drain only".
- **Verification**: Trigger cost alert; confirm intended channel receives it.

---

## 5. Testing & Red Flags

### 5.1 Health check — **P2**

- **Detection**: No `/health` or `/api/health` endpoint found.
- **Impact**: Load balancers and orchestrators cannot confirm app liveness.
- **Fix**: Add GET `/api/health` returning 200 (and optionally DB ping for readiness).
- **Verification**: `curl -s -o /dev/null -w "%{http_code}" https://<host>/api/health` → 200.

### 5.2 Red-flag checklist (sampling)

- **Magic strings**: Role strings repeated (e.g. `"super_admin", "company_admin", "recruiter"`); consider shared constant.
- **Copy-paste**: Auth checks repeated across routes; centralised in `getAuthContext` + `hasRole` — OK.
- **Unused imports**: Not systematically checked; run ESLint with no-unused-vars.
- **Placeholder implementations**: None found (no "Not implemented" throws in hot paths).

---

## 6. Required: `.env.example`

**Action**: Add `.env.example` at repo root with every variable used in the app (no values, only names and short comments). Ensures no hallucinated or undocumented env vars.

Variables to include (from audit):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=https://tigerhire.io

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_SCALE=
STRIPE_PRICE_CANDIDATE_PRO=

# AI / Agents
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@tigerhire.io

# Scraping / Signals
APIFY_API_TOKEN=

# WhatsApp (Meta)
WHATSAPP_API_KEY=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_SECRET=
WHATSAPP_ACCESS_TOKEN=

# Cron / Internal
CRON_SECRET=

# Optional: Rate limit (Vercel KV / Upstash)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Optional: Dev / Test
NODE_ENV=development
NEXT_PUBLIC_SHOW_TEST_ACCOUNTS=
NEXT_PUBLIC_TEST_PASSWORD=
SEED_DEMO_SECRET=

# Optional: Waitlist
WAITLIST_COUNT_SEED=0

# Optional: Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

---

## 7. Verification Commands (from checklist)

Run before release:

```bash
npm audit --audit-level=moderate
npx tsc --noEmit
npm run lint
# If available: snyk test, semgrep --config=auto
```

---

## 8. Summary of Fixes (priority order)

1. **P1** — Contact route: return 500 and do not claim success when DB insert fails; add logger in catch.
2. **P1** — Add `.env.example` with all variables above.
3. **P2** — Employee pages: add `.catch()` to fetch chains (my-referrals, refer).
4. **P2** — Unify rate limiting: single implementation and API; migrate all call sites.
5. **P2** — Replace remaining `console.error` in API routes with `logger.error`.
6. **P2** — Add GET `/api/health` (and optional DB check).
7. **P2** — NotificationDropdown: handle PATCH failure (revert or toast).
8. **P2** — (Optional) Harden security/rate-limit with atomic increment or document best-effort.
9. **P3** — Admin role log: use `new_role` or `role` instead of `message`.
10. **P3** — Alerts: implement Slack/Resend or document log-only.

---

_End of audit. Re-run after major changes or before production release._
