# Feature Flags

## Overview

Runtime feature flags are read via `@/lib/feature-flags` with layered resolution:

1. Global default from `feature_flags`
2. Optional organisation override from `organisation_runtime_feature_flag_overrides`
3. Effective value = `org_override ?? global_default`

This supports org-specific rollout while preserving global defaults and emergency controls.

## Usage in Code

```ts
import { isEnabled } from "@/lib/feature-flags";

if (!(await isEnabled("scout_agent", organisationId))) {
  logger.warn("Scout agent disabled via feature flag");
  return;
}
// proceed with feature
```

Batch usage:

```ts
import { getEnabledFlags } from "@/lib/feature-flags";

const flags = await getEnabledFlags(["scout_agent", "verify_agent"], organisationId);
```

## Admin API

- **GET /api/admin/feature-flags** — List all flags (super_admin only). Returns `{ flags: [{ key, enabled, description, updated_at }] }`.
- **PATCH /api/admin/feature-flags** — Update a global default (super_admin only). Body: `{ key: string, enabled: boolean }`.
- **GET /api/admin/organisations/:id/runtime-flags** — List org runtime overrides with global defaults/effective values (super_admin only).
- **PATCH /api/admin/organisations/:id/runtime-flags** — Upsert org runtime override. Body: `{ flagKey: string, enabled: boolean, reason?: string }`.
- **DELETE /api/admin/organisations/:id/runtime-flags** — Clear org runtime override. Body: `{ flagKey: string }`.

## Existing Flags (see `supabase/schema/36_rate_limit_and_flags.sql`)

| Key                            | Description                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| scout_agent                    | CV parsing via WhatsApp                                         |
| fitscore_agent                 | FitScore calculation on new CV/JD                               |
| rerank_agent                   | Claude re-rank pass on top 10                                   |
| vouch_agent                    | Vouch collection via WhatsApp                                   |
| verify_agent                   | Background verification checks                                  |
| scheduler_agent                | Interview slot scheduling                                       |
| ghostbuster_authenticity_agent | Candidate Authenticity Check (CV AI-authorship / manipulation)  |
| ghostbuster                    | Heuristic reliability / engagement scoring (`ghost_risk_score`) |
| employee_portal                | Employee referral portal                                        |
| salary_arbitrage               | Salary recommendations (Phase 2)                                |
| ai_summaries                   | Claude AI summaries on candidate cards                          |
| consent_flow                   | DPDP consent capture — DO NOT DISABLE                           |
| whatsapp_templates             | Use approved templates for outbound — DO NOT DISABLE            |

## Adding a New Flag

1. Insert into `feature_flags` (migration or SQL): `INSERT INTO feature_flags (key, enabled, description) VALUES ('my_feature', true, 'My feature');`
2. In code, guard the feature: `if (!(await isEnabled('my_feature', organisationId))) return;`
3. Optionally set org-specific overrides in `organisation_runtime_feature_flag_overrides`.

## Cache

- In-memory cache: 30 seconds
- Redis cache: 30 seconds
- Global updates invalidate global and org-scoped cached values for that key.
- Org override updates invalidate that org+flag cache key.

## Failure Semantics

- Missing DB row defaults to `enabled: true` (safe rollout default).
- Lookup exceptions fail closed (`false`) and emit a warning log.
