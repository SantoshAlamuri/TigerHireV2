# Push Migration to Correct Supabase Project

## Step 1: Find Your Project

You mentioned the project should be **"Tigerhire"** or **"Tigerhire staging"**. These are project **names**, not refs. We need to find the project **ref** (UUID-like identifier).

### Option A: Via Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Look for projects named:
   - **"Tigerhire"** (production)
   - **"Tigerhire staging"** (staging)
3. Click on the project you want to use
4. Go to **Settings → General**
5. Find the **Reference ID** (this is the project ref, e.g., `htdyomyhkvhcwoeodwas`)
6. Copy this ref

### Option B: Via Supabase CLI

```bash
# Login first
npx supabase login

# List all projects
npx supabase projects list

# Look for projects with names "Tigerhire" or "Tigerhire staging"
# The output will show both name and ref
```

## Step 2: Link to the Correct Project

Once you have the project ref, link to it:

```bash
# For production (Tigerhire)
npx supabase link --project-ref <production-ref>

# OR for staging (Tigerhire staging)
npx supabase link --project-ref <staging-ref>
```

**Which one to use?**

- **Staging**: Use if you want to test the migration first
- **Production**: Use if you're ready to apply to production

## Step 3: Push the Migration

After linking, push the migration:

```bash
npx supabase db push
```

This will apply `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql` to the linked project.

## Step 4: Verify

After pushing, verify the migration worked:

1. Go to Supabase Dashboard → SQL Editor
2. Run this query:

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

## Quick Reference

**Current project ref in config**: `htdyomyhkvhcwoeodwas`  
**Migration file**: `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql`

If you want to use a different project, just link to it first, then push.
