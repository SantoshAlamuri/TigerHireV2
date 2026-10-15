# Production Data Cleanup

Before production launch, clean test and seed data from the database while **keeping all user accounts** (auth and profiles).

## What Gets Removed

- **Organisations** (e.g. Finstack, TalentBridge from seed)
- **Jobs** (including "[Seed] …" and "Demo JD for Hiring Manager")
- **Candidates**, applications, fit_scores, pipeline data
- **Agency clients** and related links
- Hiring requests, invites, subscriptions, messages, referrals, etc.

## What Stays

- **Auth users** (Supabase `auth.users`)
- **Profiles** (role, full_name, etc.). `organisation_id` is set to `NULL` when organisations are deleted (schema uses `ON DELETE SET NULL`).

## How to Run

1. **Back up the database** (Supabase Dashboard → Database → Backups, or `pg_dump`).
2. Open **Supabase Dashboard → SQL Editor** (or connect with `psql`).
3. Run the script:  
   [`supabase/scripts/clean-production-data.sql`](../supabase/scripts/clean-production-data.sql)
4. Run it in a **single transaction** (the script is wrapped in `BEGIN;` / `COMMIT;`).

## After Cleanup

- All **Agency** and **Company** dashboards will show empty state (no clients, no jobs, no pipeline). Data is loaded from the DB; there is no hardcoded dashboard data.
- **Storage**: Buckets (`resumes`, `candidate-cvs`, `verification-videos`) may still contain files. Delete objects in **Supabase Dashboard → Storage** if you need empty buckets.
- **Seeding**: Do **not** run `POST /api/auth/seed-demo-users` or `POST /api/seed/finstack` in production. Those routes are for local/demo use only.

## Optional: Clear More Tables

The script includes commented-out deletes for:

- `notifications`
- `rate_limit_log`
- `idempotency_keys`
- `agent_logs`
- `waitlist`, `contact_submissions`
- `saved_searches`, `email_preferences`

Uncomment the ones you want for a fuller reset. Leaving `saved_searches` and `email_preferences` keeps user preferences across the cleanup.
