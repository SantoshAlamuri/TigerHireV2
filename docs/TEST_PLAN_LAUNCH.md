# April 2nd Launch – Test Plan

## Scope

This plan covers testing for the April 2nd launch scope: auth, applications (including withdrawal), health, feature flags, Redis, and critical recruiter/candidate flows.

## Critical Test Paths (Priority Order)

1. **Auth**
   - Login: valid credentials → 200, invalid → 401, rate limit → 429, validation → 422.
   - Register: valid body → 201, duplicate/error → 4xx, validation → 422.
   - Session: protected routes redirect to login when unauthenticated.

2. **Applications**
   - List: candidate sees own applications; recruiter sees org applications; filters (status, jobId).
   - Create: candidate can apply; duplicate candidate+job → error.
   - Withdraw: candidate can set status to withdrawn; recruiter gets in-app notification; list supports status=withdrawn.

3. **Health**
   - Liveness: GET /api/health → 200, ok: true.
   - Readiness: GET /api/health?ready=1 → 200 if DB up, 503 if DB down.
   - Deps: GET /api/health?ready=1&deps=1 → deps.stripe, deps.redis, etc.

4. **Feature flags**
   - Admin: GET/PATCH /api/admin/feature-flags (super_admin only); list and update flags; cache cleared on update.
   - Usage: isEnabled(flag) used in agents; default true on lookup failure.

5. **Redis**
   - Optional: app works without Redis; when configured, cacheGet/cacheSet/cacheDel and health deps.redis.

6. **Payments (Stripe)**
   - Webhook: idempotency, signature verification, subscription lifecycle.

7. **RBAC**
   - Role-based access: admin routes (super*admin), recruit routes (recruiter/company_admin/agency), candidate routes (candidate*\*).

## Test Types

| Type        | Tool       | Where                          | Focus                        |
| ----------- | ---------- | ------------------------------ | ---------------------------- |
| Unit        | Vitest     | tests/unit/, src/\*_/_.test.ts | Handlers, utils, validations |
| Integration | Vitest     | tests/integration/             | API routes with mocks        |
| E2E         | Playwright | e2e/ (if present)              | Critical user journeys       |

## Coverage Targets

| Week | Target | Notes                   |
| ---- | ------ | ----------------------- |
| 1    | 15%    | Auth, health, helpers   |
| 2    | 30%    | Applications, withdraw  |
| 5    | 70%    | Repos, services, routes |

## Running Tests

- Unit + integration: `npm run test` or `npx vitest run`
- Coverage: `npm run test:coverage`
- E2E: `npm run test:e2e`

## Sign-off

- [ ] All critical paths have at least one automated test.
- [ ] Withdraw flow: API + notification covered.
- [ ] No P0 bugs open before launch.
