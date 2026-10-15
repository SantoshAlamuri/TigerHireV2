# TigerHire Module-First Architecture Checklist

This checklist keeps the codebase industry-standard, modular, and scalable as features grow.

## 1) Layered Structure (required)

- `src/app`: routes, pages, layouts, and API route entrypoints only.
- `src/components`: reusable UI components only.
- `src/lib`: business logic, domain services, repositories, validations, integrations.
- `supabase`: schema, migrations, SQL utilities (database source of truth).
- `tests`: unit, integration, component, and e2e tests.

## 2) Dependency Boundaries (required)

- `src/lib` must not import from `src/app`.
- `src/app/api` must not import from `src/components`.
- UI (`src/components` and page files) must not import admin DB clients.
- Route handlers must stay thin: validate -> authorize -> orchestrate service calls -> return response.

## 3) Feature-First Modules (required for new work)

Every new major feature should be grouped by domain, not by technical layer alone.

Recommended domain module shape under `src/lib/<feature>/`:

- `service.ts` or `*Service.ts`: orchestration and business workflows.
- `repository.ts`: data access abstractions.
- `validation.ts`: Zod schemas and input contracts.
- `types.ts`: domain types.
- optional `events.ts`, `policy.ts`, `mapper.ts` based on complexity.

For route handlers, colocate at:

- `src/app/api/<feature>/.../route.ts`

For dashboard screens, colocate at:

- `src/app/(dashboard)/<persona>/<feature>/...`

## 4) Size and Complexity Controls (required)

- Avoid "god files". Split early when:
  - API route file approaches 600+ lines.
  - Single function approaches 120+ lines.
  - File mixes unrelated concerns (auth + data + formatting + side effects).
- Current lint guardrails enforce hard limits for API routes to prevent 10,000-line files.

## 5) API Contract Standards (required)

- Validate all external input with Zod.
- Use helpers from `@/lib/api-helpers` for auth/response/error flow.
- Enforce tenant isolation via established tenancy helpers.
- Keep side effects (notifications, external API calls) behind service layer boundaries.

## 6) Database Standards (required)

- No schema drift outside `supabase/migrations`.
- One migration per logical change-set.
- Every migration should include rollback notes in PR description.
- RLS and tenancy checks are mandatory for new multi-tenant tables/endpoints.

## 7) Testing Checklist (required)

- Unit tests for business logic in `src/lib`.
- Integration tests for API + DB behavior.
- e2e tests for critical user journeys.
- New feature work is not complete without test coverage for happy path + key failure path.

## 8) PR Checklist (copy into PR template)

- [ ] Feature placed in a domain module (not scattered across unrelated folders).
- [ ] Route handler is thin and delegates to service/repository.
- [ ] No layer boundary violations.
- [ ] Inputs validated, auth enforced, tenant scope enforced.
- [ ] Migration added (if schema changed) and reviewed.
- [ ] Unit/integration tests added or updated.
- [ ] Lint, typecheck, and relevant tests pass.

## 9) Anti-Patterns to Reject

- Direct DB admin client imports in UI.
- Large mixed-responsibility route handlers.
- Cross-domain shortcuts that bypass service/repository boundaries.
- Feature logic duplicated across multiple routes/pages.
- "Temporary" files that become permanent without ownership.

## 10) Adoption Plan

1. Apply this checklist to all new feature work immediately.
2. For existing large files, refactor incrementally when touched (boy scout rule).
3. Treat lint boundary violations as blockers, not suggestions.
4. Review architecture drift weekly (quick 30-minute module ownership review).
