# Staging environment

Use a staging environment that mirrors production so you can test migrations and releases safely.

## Checklist

### Vercel

- [ ] Create a **separate Vercel project** for staging (e.g. `tigerhire-staging`) or use **Preview** deployments for branch `staging`.
- [ ] Connect the same repo; set **Production branch** to `main` and (optional) **Preview** to `staging`.
- [ ] In staging project **Settings → Environment Variables**, set:
  - `NEXT_PUBLIC_APP_URL` = your staging app URL (e.g. `https://tigerhire-staging.vercel.app`)
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **staging** Supabase project (see below)
  - `SUPABASE_SERVICE_ROLE_KEY` = staging project service role key
  - `CRON_SECRET`, Stripe **test** keys, Resend, etc. for staging-only resources.
- [ ] Do **not** use production Supabase or production Stripe in staging.

### Supabase

- [ ] **Option A – Branching:** Use [Supabase Branching](https://supabase.com/docs/guides/platform/branching) so each Git branch gets a temporary DB. Good for PR previews.
- [ ] **Option B – Staging project:** Create a second Supabase project (e.g. `tigerhire-staging`). Use it for the staging Vercel project.
- [ ] Run migrations on staging **before** production: `npx supabase link --project-ref <staging-ref>` then `npm run db:push`. After verification, run the same migrations on production.

### After setup

- [ ] Run full regression (auth, apply, billing with test cards, webhooks with test payloads).
- [ ] Document staging URL and who has access in your team runbook.
