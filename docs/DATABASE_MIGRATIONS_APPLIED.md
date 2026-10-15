# Database Migrations Applied to Supabase

**Date:** March 20, 2026  
**Status:** ✅ All migrations successfully applied

## Summary

Verified and applied all missing database migrations from local repository to Supabase production database using MCP (Model Context Protocol).

---

## Migrations Applied

### 1. ✅ `fit_scores_test_runs` (20260320052641)

**Purpose:** Add test run support to `fit_scores` table for consistency testing

**Changes:**

- Added `is_test_run` column (boolean, default: false)
- Added `run_index` column (integer, default: 1)
- Dropped old unique constraint `fit_scores_job_candidate_unique`
- Created partial unique index `fit_scores_job_candidate_production_unique` (WHERE is_test_run = false)
- Created index `idx_fit_scores_test_runs` for querying test runs

**Impact:**

- Allows multiple test runs per candidate+job pair while preserving production scores
- Enables force-rescore flag to bypass caching and test model consistency
- Production scores always have `is_test_run = false` and `run_index = 1`
- Test runs increment `run_index` (2, 3, 4, etc.)

---

### 2. ✅ `fit_scores_fix_unique_constraint` (20260320052650)

**Purpose:** Fix unique constraint issue that was causing production score upserts to fail silently

**Problem:**

- Previous migration created a partial unique index `(job_id, candidate_id) WHERE is_test_run = false`
- Supabase JS client's `upsert()` with `onConflict` cannot target partial indexes
- This caused ALL production score saves to fail silently

**Changes:**

- Added composite unique index `fit_scores_job_candidate_run_unique` on `(job_id, candidate_id, run_index)`
- This works with standard conflict resolution patterns
- Backfilled existing rows: set `is_test_run = false` and `run_index = 1` where NULL
- Set column defaults for safety

**Impact:**

- Application code can now use select+update/insert pattern reliably
- Production scores are properly persisted to database
- Fixes the critical bug from commit `90e7f55`

---

## Verification

### Columns Verified

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'fit_scores'
AND column_name IN ('is_test_run', 'run_index');
```

**Result:**

- ✅ `is_test_run`: boolean, default: false, nullable: YES
- ✅ `run_index`: integer, default: 1, nullable: YES

### Indexes Verified

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'fit_scores'
AND (indexname LIKE '%test_run%' OR indexname LIKE '%run_unique%' OR indexname LIKE '%production_unique%');
```

**Result:**

- ✅ `fit_scores_job_candidate_production_unique` - Partial unique index (WHERE is_test_run = false)
- ✅ `fit_scores_job_candidate_run_unique` - Composite unique index (job_id, candidate_id, run_index)
- ✅ `idx_fit_scores_test_runs` - Query index (job_id, candidate_id, is_test_run, run_index)

---

## Migration Status

**Total migrations in Supabase:** 48  
**Latest migration:** `fit_scores_fix_unique_constraint` (20260320052650)

All local migrations have been successfully applied to Supabase.

---

## Related Files

- `supabase/migrations/20260320120000_fit_scores_test_runs.sql`
- `supabase/migrations/20260320130000_fit_scores_fix_unique_constraint.sql`
- `src/lib/fitscore/three-stage/supabase-adapter.ts` (uses these migrations)

---

## Next Steps

1. ✅ **Database migrations applied** - All local changes are now in Supabase
2. ✅ **Code changes deployed** - Application code already uses select+update/insert pattern
3. ⚠️ **Monitor production** - Watch for any scoring persistence issues
4. ✅ **Test runs enabled** - Can now test model consistency with force-rescore flag

---

## Notes

- Both migrations use `IF NOT EXISTS` guards for idempotency
- The partial unique index is kept for defense-in-depth
- The composite unique index is the primary constraint used by application code
- All existing production scores were backfilled with `is_test_run = false` and `run_index = 1`
