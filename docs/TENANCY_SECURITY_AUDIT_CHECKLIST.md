# Tenancy and Security Audit Checklist

This checklist targets tenant isolation and security correctness across API, service, and data access layers.

## Tenant isolation invariants (non-negotiable)

- No authenticated route may return or mutate another tenant's data.
- `organisation_id` (or equivalent tenant scope) must be enforced server-side.
- Client payload tenant identifiers are never trusted without auth-context verification.
- Cache keys must include tenant/user scope where data is tenant-specific.
- Background/cron flows must scope by tenant for each operation batch.

## Route handler checks (`src/app/api/**/route.ts`)

- Uses auth context for protected endpoints.
- Uses tenant-scoped DB access for tenant-bound data.
- Verifies resource ownership before read/update/delete.
- Applies input validation (Zod schemas or equivalent).
- Uses standardized error mapping and avoids leaking internals.
- Applies rate limiting and CSRF/origin validation where required.

## Service layer checks (`src/lib/services`)

- Service methods do not bypass role/tenant checks assumed by callers.
- Integrations and external calls sanitize and validate outbound payloads.
- Retry logic is bounded and idempotent where side effects exist.
- Secret reads/writes flow through approved secret utilities only.

## Repository layer checks (`src/lib/repositories`)

- Every query has deterministic tenant and ownership scope.
- No helper exposes "get all" without explicit admin/system boundary.
- Upsert/update/delete operations enforce scope in `where` clauses.
- Soft-delete and archived records do not leak through active queries.

## Identity and access checks

- Auth failures consistently return `401`.
- Authenticated-but-not-authorized returns `403` (or deliberate `404` masking pattern).
- Deactivated user behavior is blocked consistently.
- SCIM bearer token verification is strict and org-bound.

## Data protection and secrets checks

- No secret values returned in API responses or logs.
- Sensitive config values are masked by default in responses.
- Secret references are stored, not raw secrets (where architecture supports it).
- PII access paths have auditability (who accessed/changed and when).

## Webhook and cron hardening checks

- Webhooks validate signature/token and reject unsigned traffic.
- Cron routes require secure auth headers/tokens.
- Webhook replay/deduplication strategy exists where required.
- Cron job mutations are idempotent and safe to retry.

## Observability and incident-readiness checks

- Sensitive routes include correlation IDs and structured error logs.
- High-risk flows emit security/audit events.
- Alerting thresholds exist for auth failures, 5xx spikes, and unusual access patterns.

## Static scan commands for quick evidence

```bash
# inventory route handlers
rg --files src/app/api | rg "route.ts$"

# find potential auth-context usage
rg "getAuthContext|requireAuth|hasRole|getTenantScopedClient" src/app/api

# find explicit org-scope checks
rg "organisation_id|organization_id|orgId|tenant" src/app/api src/lib

# find direct admin client usage in user-facing paths (review carefully)
rg "createSupabaseAdmin|service_role|SUPABASE_SERVICE_ROLE_KEY" src/app/api src/lib

# find unbounded select patterns in repositories
rg "\\.select\\(" src/lib/repositories
```

## Immediate red flags (auto P0/P1 candidates)

- Cross-tenant read/write reproducible with direct API call.
- Missing auth guard on mutating tenant route.
- Privilege escalation by role/capability spoofing.
- Secrets exposed to client payloads/logs.
- Webhook accepted without signature/auth validation.
