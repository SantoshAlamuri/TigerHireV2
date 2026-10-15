# Cascade migrations — ledger mismatch (prod) + idempotency

**Hazard (recorded 2026-06-04):** The three cascade migrations were applied to **prod `htdyomyhkvhcwoeodwas` via the Supabase MCP**, which recorded them under **MCP-generated versions**, not the repo file timestamps:

| Repo file version | Recorded on prod (MCP) | Name                                    |
| ----------------- | ---------------------- | --------------------------------------- |
| `20260604120000`  | `20260604133147`       | `0001_cascade_schema`                   |
| `20260604130000`  | `20260604133200`       | `cascade_structured_jd`                 |
| `20260604140000`  | `20260604133222`       | `backfill_scoring_method_hybrid_merged` |

**Consequence:** A future `supabase db push` sees the file-versioned migrations as **unapplied** and re-runs them.

**Mitigation applied:** `20260604120000_0001_cascade_schema.sql` now wraps every `CREATE POLICY` with `DROP POLICY IF EXISTS …` (the only non-idempotent statements; tables/columns/flags already used `IF NOT EXISTS` / `ON CONFLICT`). The full chain is now **safe to re-run on any environment**, regardless of ledger drift.

**Backfill fix:** `20260604140000_…sql` previously set `updated_at = now()`, but `fit_scores` has no `updated_at` column — it failed on every environment. Now sets `scoring_method` only.

**Environment state (verified, not assumed):**

- Prod `htdyomyhkvhcwoeodwas`: cascade schema applied (columns + tables + 6 flags OFF).
- Staging `qzhhhsvtyqyixpcdfhng`: already had the full cascade schema (`model_used`, `scoring_tier`, `structured_jd`, `jd_requirements`, `prescreen_questions`) — no drift, prod was behind, now aligned.

**If reconciling the ledger instead of (or in addition to) idempotency:** insert the file-versioned rows into `supabase_migrations.schema_migrations`, or rename the files to the MCP versions — so `db push` and prod agree.

**Rollback relocated (first-run safety):** the destructive rollback was moved from `supabase/migrations/20260604120001_0001_cascade_schema_down.sql` to `supabase/rollbacks/0001_cascade_schema_down.sql`. Inside `migrations/`, a `supabase db push` ran it in timestamp order immediately after the create and tore the schema back down on a fresh environment. It is now apply-manually-only (MCP/psql).
