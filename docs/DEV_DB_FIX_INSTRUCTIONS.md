# Dev Database Fix Instructions

## Problem

Jobs are failing to be created with 500 errors. This is typically due to:

1. Missing database columns in the `jobs` table
2. Missing or incorrect RLS policies
3. Missing `auth_organisation_ids()` function
4. Missing `job_status` enum type

## Solution

Run the migration file to fix the dev database schema:

```bash
# Option 1: Using Supabase CLI (recommended)
supabase db reset  # If you want to start fresh
# OR
supabase migration up  # Apply new migrations

# Option 2: Using Supabase Dashboard
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy and paste the contents of: supabase/migrations/20260320000000_fix_jobs_dev_schema.sql
# 3. Run the migration
```

## What the Migration Does

1. **Ensures `job_status` enum exists** - Required for the `status` column
2. **Creates/updates `auth_organisation_ids()` function** - Critical for RLS policies to work correctly
3. **Adds missing columns to `jobs` table**:
   - `show_salary` (boolean, default false)
   - `role_function`, `seniority_level`
   - `skills_required`, `skills_preferred`
   - `remote_allowed`
   - `jd_sections` (jsonb)
   - `hiring_manager_id`
   - `assigned_recruiter_id`
   - `shortlist_due_at`, `shortlist_delivered_at`
4. **Creates missing indexes** for performance
5. **Ensures RLS is enabled** and policies are correct

## Verification

After running the migration, verify:

```sql
-- Check if all columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'jobs'
ORDER BY ordinal_position;

-- Check if function exists
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'auth_organisation_ids';

-- Check RLS policies
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'jobs';
```

## Common Issues

### Issue: "column does not exist"

**Solution**: The migration should add all required columns. If you still see this error, check:

- Did the migration run successfully?
- Are you using the correct database?

### Issue: "permission denied"

**Solution**: Ensure you're running the migration as a user with sufficient privileges (usually the service role or postgres user).

### Issue: "relation already exists"

**Solution**: The migration uses `IF NOT EXISTS` and `DROP POLICY IF EXISTS`, so it should be safe to run multiple times. If you see this error for the enum, it's expected and safe to ignore.

## Next Steps

After fixing the database:

1. Restart your dev server
2. Try creating a job again
3. Check server logs for any remaining errors
4. Verify job creation works end-to-end
