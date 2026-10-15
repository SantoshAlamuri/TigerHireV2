# Code quality roadmap

This document turns engineering quality into **measurable outcomes** and a rolling plan. Update targets quarterly.

## North-star metrics (rolling)

1. **Reliability** — Sentry issue rate on golden paths: login, apply (`/api/apply`), WhatsApp webhook, Inngey/worker failures. Target: trend down; alert on regressions per release.
2. **Correctness** — No unscoped multi-tenant reads/writes: PR checklist for `getTenantScopedClient` vs admin client; migration review for RLS. Target: zero Sev-1 tenant leaks; CI migration safety + tests on auth/tenant code.
3. **Change safety** — Mean time to restore (MTTR) and “change failure rate” (failed deploys / deploys). Target: small PRs, feature flags where risky.

## 90-day focus

| Window | Focus                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Now    | Enforce worker registration (`check:inngest-registration`), remove dead exports/components, keep `gate` green before merge. |
| Next   | Tighten `ts-prune`/Knip with an allowlist so informational output can become blocking where false positives are managed.    |
| Then   | Golden-path SLOs in observability (one dashboard: apply + webhooks + Inngest).                                              |

## Definition of Done (suggested)

- API route: Zod-validated input, correct Supabase client, tests for non-trivial logic.
- Migration: reviewed for destructive ops; `scripts/check-migrations-safety.mjs` passes.
- Background job: exported function from `src/inngest/functions.ts` **and** listed in `src/app/api/inngest/route.ts` (validated by `npm run check:inngest-registration`).

## Commands

- `npm run gate` — typecheck, lint, format, schemas, size check, Inngest registration.
- `npm run check:inngest-registration` — only the Inngest serve() consistency check.
