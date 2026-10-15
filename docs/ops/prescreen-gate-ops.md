# Prescreen Per-Channel Gate — Ops Pack

Phase 3, Option A. Flag: `ff_whatsapp_gate` (global default **OFF**). Branch: `claude/prescreen-per-channel-gate`.

**Schema first:** DDL does not ride Vercel deploy. Apply and verify migrations per
[`apply-db-migration-staging-prod.md`](./apply-db-migration-staging-prod.md) before
any soak or flag flip.

## What it does

When `ff_whatsapp_gate` is ON for an org, a new application:

1. Sets `applications.gate_status = 'pending'` (via `ApplicationService.create` chokepoint — covers form / WhatsApp / board / email).
2. Creates a `prescreen_sessions` row and (for async channels with a phone) sends the first gating question.
3. `FitScoreService.computeSingle` **holds** LLM scoring while `pending`, **skips** (writes a `Gated Out` deferred row) when `failed`, and proceeds for `passed` / `unverified` / `NULL`.
4. Inngest `prescreen-lifecycle` sends one reminder at `PRESCREEN_REMINDER_HOURS` (default 24h), then force-resolves to `unverified` at `PRESCREEN_TIMEOUT_HOURS` (default 48h) and enqueues scoring.
5. Safety net: `/api/cron/prescreen-sweep` (every 6h) force-resolves any session still open past `timeout + PRESCREEN_PENDING_SWEEP_BUFFER_HOURS`.

Gate is **safe with no candidate interaction**: unanswered gates time out to `unverified` and still get scored (with the unanswered must-haves recorded in `applications.unverified_must_haves`).

## Soak (test/staging org you control — not a live customer)

```bash
# Fast timeouts so a full lifecycle runs in minutes, not days.
export PRESCREEN_REMINDER_HOURS=0.02      # ~72s
export PRESCREEN_TIMEOUT_HOURS=0.05       # ~3m
export PRESCREEN_PENDING_SWEEP_BUFFER_HOURS=0.02
```

1. Enable the flag for the test org only (org-scoped override), keep global OFF.
2. Create applications via each channel; confirm `gate_status='pending'` and a `prescreen_sessions` row.
3. Confirm scoring is held (no fresh `fit_scores` row while pending).
4. Answer NO → `failed` + a `Gated Out` `fit_scores` row, no LLM call.
5. Answer all YES → `passed` + a real `fit_scores` row.
6. Let one expire → `unverified` + `unverified_must_haves` populated + a real `fit_scores` row.
7. Manually leave one session open and hit `/api/cron/prescreen-sweep` → it resolves to `unverified`.

## Standing queries

```sql
-- Gate-status mix (last 7d)
SELECT gate_status, count(*)
FROM applications
WHERE created_at > now() - interval '7 days'
GROUP BY gate_status ORDER BY 2 DESC;

-- Open sessions by channel + state (should trend to 0 as lifecycle/sweep run)
SELECT channel, state, count(*)
FROM prescreen_sessions
WHERE state <> 'complete'
GROUP BY channel, state ORDER BY 1, 2;

-- Stuck pending (older than timeout+buffer) — sweep should be catching these
SELECT count(*) AS stuck_pending
FROM prescreen_sessions
WHERE state <> 'complete'
  AND questions_sent_at < now() - interval '54 hours';  -- 48h + 6h buffer

-- Gated-out (failed) vs scored, last 7d
SELECT scoring_method, scoring_status, count(*)
FROM fit_scores
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Schema parity (staging vs prod) — check before flip

The NO-on-Q2 soak writes `applications.gate_status` and a deferred `fit_scores` row via
`saveGatedFitScore` (`scoring_method = prescreen_gate`, `band = Gated Out`, `scoring_status = deferred`,
`superseded_at` / `superseded_by_id` nullable). **Staging and prod must match on these objects before a
staging green predicts prod.**

Run on **both** projects (`qzhhhsvtyqyixpcdfhng` staging, `htdyomyhkvhcwoeodwas` prod). Expect identical
column sets and types:

```sql
-- Gate path: fit_scores columns saveGatedFitScore + guard read
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'fit_scores'
  AND column_name IN (
    'scoring_status', 'scoring_status_reason', 'scoring_status_updated_at',
    'superseded_at', 'superseded_by_id',
    'scoring_method', 'band', 'overall_score', 'run_index', 'is_test_run',
    'one_line_summary', 'summary', 'scoring_version'
  )
ORDER BY column_name;

-- Gate path: application state
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'applications'
  AND column_name IN ('gate_status', 'unverified_must_haves')
ORDER BY column_name;

-- Active-score unique index (supersede history)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'fit_scores'
  AND indexname = 'fit_scores_job_candidate_active_unique';
```

**Verified 2026-06-10:** prod and staging now match on the gate-relevant `fit_scores` columns above,
`applications.gate_status` / `unverified_must_haves`, and `fit_scores_job_candidate_active_unique`.

### Staging catch-up (2026-06-10, MCP apply_migration)

During the NO-on-Q2 integration soak, staging was **behind prod** on two repo migrations:

| Repo migration                                    | Prod ledger name               | Staging catch-up (MCP apply_migration name)                       |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `20260420140500_fit_scores_scoring_status.sql`    | `fit_scores_scoring_status`    | `fit_scores_scoring_status_staging_catchup` (`20260610052243`)    |
| `20260430070500_fit_scores_supersede_history.sql` | `fit_scores_supersede_history` | `fit_scores_supersede_history_staging_catchup` (`20260610052311`) |

DDL is idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` N/A — no RLS in these files).
**Ledger names differ from repo filenames** (MCP records apply-time version timestamps, same pattern as
prescreen gate migrations). Objects on disk match prod; only the migration history label differs.

**Automated soak (load-bearing, WhatsApp NO-on-Q2):** after staging fixture setup
(`scripts/sql/prescreen-soak-staging-setup.sql`), run:

```bash
PRESCREEN_SOAK_STAGING=1 \
NEXT_PUBLIC_SUPABASE_URL=https://qzhhhsvtyqyixpcdfhng.supabase.co \
SUPABASE_SERVICE_ROLE_KEY='<staging service role>' \
npx vitest run tests/integration/prescreen-gate-whatsapp-no-q2.test.ts
```

Pass = one `prescreen_gate` / Gated Out row, zero hybrid LLM rows, `prescreen_gate_blocked` from
`FitScoreService.computeSingle`.

## Pre-flip checklist (Kimshuka / prod)

1. Promote `dev` → `main`; confirm **prod Vercel SHA** (consent fix `fa4bc1f6` on `main` tip when promoted).
2. Run **schema parity** query above on prod (same trip as SHA check).
3. Ask Kimshuka: **testing via WhatsApp?** (form/email have no interactive Q&A resolution yet).
4. **Org-scoped flip only:** `ff_whatsapp_gate` ON for Kimshuka's org; global stays OFF.
5. Staging fixture: Finstack Demo JD (`1efb213a-5c92-4db4-a0d9-5fa0268b25c1`) — see soak SQL script.

## Rollback

Set `ff_whatsapp_gate` OFF (global + any org overrides). Existing `pending` rows: run the sweep once, or
`UPDATE applications SET gate_status = NULL WHERE gate_status = 'pending';` to release them for normal scoring.

## Remaining UX-layer follow-ups (not safety-critical; gate already enforces + times out)

- WhatsApp **inbound** YES/NO routing in `src/lib/whatsapp/handler.ts` so answers resolve the gate before timeout (today WhatsApp/board gates resolve via timeout → `unverified` unless answered in-app).
- Recruiter UI: exclude `failed` (`Gated Out`) from default shortlist and surface `unverified_must_haves` as an "Unverified:" badge.
