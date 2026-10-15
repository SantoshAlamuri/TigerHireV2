# V5 Deployment Checklist

These tasks require Supabase Dashboard / Vercel Dashboard access and cannot be automated via code.

## S3-10: Supabase Configuration

### Auth Settings (Supabase Dashboard → Authentication → Settings)

- [ ] Enable email confirmation (require users to confirm email before login)
- [ ] Set minimum password length to 12 characters
- [ ] Set JWT expiry to 28800 seconds (8 hours)
- [ ] Enable refresh token rotation

### Storage (Supabase Dashboard → Storage)

- [ ] Set `candidate-cvs` bucket to **Private** (no public access)
- [ ] Set `job-assets` bucket to **Private** (no public access)

### Database (Supabase Dashboard → Database → Settings)

- [ ] Set connection pooling mode to **Transaction**
- [ ] Disable Realtime on these tables (Database → Replication):
  - `candidates`
  - `fit_scores`
  - `consent_records`
  - `rate_limit_log`
  - `agent_logs`

### Backups (Supabase Dashboard → Database → Backups)

- [ ] Enable Point-in-Time Recovery (PITR) if on Pro plan or above

### RLS Audit

Run this query in SQL Editor to verify all public tables have RLS enabled:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Every row should show `rowsecurity = true`. If any table has `false`, enable it:

```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

## S3-12: Vercel Instant Rollback Test

1. Deploy current `main` branch to **staging** environment
2. Make a trivial change (e.g. update a comment) and deploy again
3. In Vercel Dashboard → Deployments, find the **previous** deployment
4. Click the three-dot menu → **Instant Rollback**
5. Verify the rollback completes in under 60 seconds
6. Verify the application loads correctly on the staging URL
7. Document the rollback procedure for the on-call team
