# Apply Migration to Staging Database

> **Note:** An older doc referenced project ref `qzhhhsvtyqyixpcdfhng` (no longer used). Use your real target project below.

## Primary TigerHire database (when staging = same as prod)

- **URL**: https://htdyomyhkvhcwoeodwas.supabase.co
- **Project Ref**: `htdyomyhkvhcwoeodwas`
- **Migration File**: `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql` (example; use the migration you intend to apply)

If you maintain a **separate** staging Supabase project, substitute its URL/ref everywhere below.

## Quick Method: Supabase Dashboard SQL Editor

### Step 1: Open SQL Editor

1. Go to: https://supabase.com/dashboard/project/htdyomyhkvhcwoeodwas (or your staging project ref)
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Copy and Run Migration

1. Open the file: `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql`
2. Copy the **entire contents** of the file
3. Paste into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 3: Verify Success

You should see a success message. Then verify the migration worked:

```sql
-- Check if all columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'jobs'
ORDER BY ordinal_position;

-- Check if function exists
SELECT proname
FROM pg_proc
WHERE proname = 'auth_organisation_ids';

-- Check RLS policies
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'jobs';
```

## Alternative: Using Supabase CLI

If you prefer CLI (requires login):

```bash
# 1. Login to Supabase
npx supabase login

# 2. Link to staging project
npx supabase link --project-ref htdyomyhkvhcwoeodwas

# 3. Push migration
npx supabase db push
```

## What This Migration Fixes

✅ Ensures `job_status` enum exists  
✅ Creates/updates `auth_organisation_ids()` function (critical for RLS)  
✅ Adds missing columns:

- `show_salary`
- `role_function`, `seniority_level`
- `skills_required`, `skills_preferred`
- `remote_allowed`
- `jd_sections`
- `hiring_manager_id`
- `assigned_recruiter_id`
- `shortlist_due_at`, `shortlist_delivered_at`
  ✅ Creates missing indexes  
  ✅ Ensures RLS is enabled and policies are correct

## After Migration

1. Restart your dev server
2. Try creating a job again
3. The 500 error should be resolved

## Notes

- The migration is **idempotent** (safe to run multiple times)
- Uses `IF NOT EXISTS` and `DROP POLICY IF EXISTS` to avoid conflicts
- If you see "already exists" errors, they're safe to ignore
