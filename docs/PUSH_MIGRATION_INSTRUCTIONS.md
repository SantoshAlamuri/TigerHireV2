# Push Migration to Supabase - Instructions

## Migration File

The migration file has been created and renamed to avoid conflicts:

- **File**: `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql`
- **Purpose**: Fixes missing columns, functions, and RLS policies for the jobs table

## Option 1: Using Supabase CLI (Recommended)

### Step 1: Login to Supabase

```bash
npx supabase login
```

This will open a browser for authentication.

### Step 2: Link to Project (if not already linked)

**Important**: Find the correct project ref first:

- Go to [Supabase Dashboard](https://supabase.com/dashboard)
- Find project named **"Tigerhire"** or **"Tigerhire staging"**
- Go to Settings → General → Copy the **Reference ID**
- Then link:

```bash
# Replace <project-ref> with the actual ref from dashboard
npx supabase link --project-ref <project-ref>
```

**Which project?**

- **"Tigerhire staging"**: For testing migrations first (recommended)
- **"Tigerhire"**: For production (apply after staging verification)

### Step 3: Push Migration

```bash
npx supabase db push
```

Or use the npm script:

```bash
npm run db:push
```

## Option 2: Using Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/htdyomyhkvhcwoeodwas
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20260320120000_fix_jobs_dev_schema.sql`
5. Paste into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

## Option 3: Using Supabase CLI with Service Role Key

If you have the service role key, you can push directly:

```bash
export SUPABASE_ACCESS_TOKEN="your-access-token"
npx supabase db push --linked
```

Or using the database URL directly:

```bash
npx supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.htdyomyhkvhcwoeodwas.supabase.co:5432/postgres"
```

## Verification

After pushing the migration, verify it worked:

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

## What This Migration Does

1. ✅ Ensures `job_status` enum exists
2. ✅ Creates/updates `auth_organisation_ids()` function (critical for RLS)
3. ✅ Adds all missing columns to `jobs` table:
   - `show_salary`
   - `role_function`, `seniority_level`
   - `skills_required`, `skills_preferred`
   - `remote_allowed`
   - `jd_sections`
   - `hiring_manager_id`
   - `assigned_recruiter_id`
   - `shortlist_due_at`, `shortlist_delivered_at`
4. ✅ Creates missing indexes
5. ✅ Ensures RLS is enabled and policies are correct

## Troubleshooting

### Error: "Access token not provided"

- Run `npx supabase login` first
- Or set `SUPABASE_ACCESS_TOKEN` environment variable

### Error: "Project not linked"

- Run `npx supabase link --project-ref htdyomyhkvhcwoeodwas`

### Error: "Column already exists"

- This is safe to ignore - the migration uses `IF NOT EXISTS`

### Error: "Permission denied"

- Ensure you're using the service role key or have admin access
- Check your Supabase project permissions

## Next Steps

After the migration is applied:

1. Restart your dev server
2. Try creating a job again
3. The 500 error should be resolved
4. Check server logs if issues persist
