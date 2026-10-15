# Per-Org Feature Flag Overrides

**Status: already implemented and live** — this doc records how to use it. The original spec
proposed a new `feature_flags_org` table; that was superseded after discovering the existing
mechanism (a duplicate table would have created the same divergence trap as the cascade ledger).
Do **not** add a second override table.

**Staging/prod DDL:** per-org overrides require
`organisation_runtime_feature_flag_overrides` on the target DB. Apply via
[`apply-db-migration-staging-prod.md`](./apply-db-migration-staging-prod.md) — deploy
alone does not create the table.

## The mechanism

- **Global defaults:** `public.feature_flags (key, enabled, …)`.
- **Per-org overrides:** `public.organisation_runtime_feature_flag_overrides
(organisation_id, flag_key, enabled, reason, updated_by, …)`, `unique(organisation_id, flag_key)`,
  `flag_key` FK → `feature_flags(key)` (same key namespace). Migration:
  `supabase/migrations/20260426184000_org_runtime_feature_flag_overrides.sql`. Super-admin RLS,
  idempotent policies.
- **Resolver:** `isEnabled(flagKey, organisationId?)` in `src/lib/feature-flags.ts` resolves:
  1. org override row for `(flag_key, organisation_id)` → its `enabled` (**org wins**),
  2. else global `feature_flags` row → its `enabled`,
  3. else `false` (unknown flag off; lookup failure fails closed).
     Caching (memory + Redis) is keyed per org; `getEnabledFlags` applies the same precedence in batch.
     Callers that pass no `organisationId` get global-only behaviour (no regression).

## End-to-end org threading (verified)

The override only matters if the read passes the owning org. Confirmed concrete:

- **Cascade scoring** — `runHybridFitScorePipeline` passes `job.organisation_id` into
  `isPathUnificationEnabled`, `resolveHybridExtractionModelWithTier` (ctc-tiering, haiku, model-router).
  `ff_structured_jd` reads org in `approveJdBase`/`JobService.create`; `ff_cascade_rerank` reads
  `input.organisationId` in `runListwiseRerank`.
- **Prescreen gate** — `ff_whatsapp_gate` gets `job.organisation_id` via `FitScoreService.computeSingle`
  → `checkScoringGuard`, and `jobRow.organisation_id` via `ApplicationService.create` → `routePrescreenAfterApplication`.

Regression-tested in `tests/unit/feature-flags-org.test.ts`.

## Environment parity (ledger-drift fix, 2026-06-04)

A live schema check found the table present on **prod** but missing on **staging**, even though the
canonical migration `20260426184000_org_runtime_feature_flag_overrides.sql` exists in the repo. Cause:

- **prod** — applied out-of-band; recorded in `supabase_migrations.schema_migrations` under version
  `20260427160958` (name `20260426184000_org_runtime_feature_flag_overrides`), **not** under the repo
  version string `20260426184000`. So the repo version is "missing" from prod's ledger.
- **staging** — never recorded at all, yet staging already has _newer_ (June cascade) migrations applied.
  `supabase db push` only applies migrations newer than the latest applied, so the April migration is
  never back-filled and the table stays absent.

Fix: a forward, fully idempotent reconciler migration
`20260604160000_ensure_org_runtime_feature_flag_overrides.sql` (mirrors `20260426184000` exactly with
`CREATE TABLE IF NOT EXISTS` + `DROP POLICY IF EXISTS`). It CREATEs the table on staging and is a no-op
on prod. Applied via the normal repo/PR/CI flow on merge to `dev` — **never** via the Supabase MCP
`apply_migration` tool (that is what caused the original drift). The original `20260426184000` remains the
canonical creator; the reconciler only converges environments that skipped it.

Note: prod's ledger still lacks the literal `20260426184000` entry. A future `supabase db push` against
prod will harmlessly re-run that idempotent file and record it (cosmetic duplicate of the same logical
table); no action required.

## Enable a flag for a single org (prod)

Global row stays OFF; only the named org flips on:

```sql
INSERT INTO public.organisation_runtime_feature_flag_overrides (organisation_id, flag_key, enabled, reason)
VALUES ('<org-uuid>', 'ff_whatsapp_gate', true, 'single-customer pilot')
ON CONFLICT (organisation_id, flag_key) DO UPDATE SET enabled = excluded.enabled, updated_at = now();
```

Verify end-to-end: org A applicants hit the gate, org B (no override) do not.

## Roll back

```sql
-- soft off
UPDATE public.organisation_runtime_feature_flag_overrides
SET enabled = false, updated_at = now()
WHERE flag_key = 'ff_whatsapp_gate' AND organisation_id = '<org-uuid>';

-- or remove the override entirely (falls back to global default)
DELETE FROM public.organisation_runtime_feature_flag_overrides
WHERE flag_key = 'ff_whatsapp_gate' AND organisation_id = '<org-uuid>';
```

Cache TTL is short (memory ~30s, Redis per `CacheTTL.FEATURE_FLAG_SEC`); changes propagate within
that window, or call `invalidateFeatureFlagCache(flagKey, organisationId)` to clear immediately.
