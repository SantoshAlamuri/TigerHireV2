# TigerHire Deployment Guide

## Prerequisites

- GitHub repo pushed to remote
- Vercel account connected to GitHub
- Domain `tigerhire.io` registered

## 1. Vercel Project Setup

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `TigerHire` repository
3. Framework Preset: **Next.js** (auto-detected)
4. Build Command: `npm run build`
5. Output Directory: `.next` (default)
6. Install Command: `npm ci`

## 2. Environment Variables

Add all of the following in Vercel Project Settings > Environment Variables.
Mark keys containing `SECRET`, `KEY`, or `TOKEN` as **Sensitive**.

### Required

| Variable                        | Source                              |
| ------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Dashboard > Settings > API |
| `CRON_SECRET`                   | Generate: `openssl rand -hex 32`    |
| `NEXT_PUBLIC_APP_URL`           | `https://tigerhire.io`              |

**Critical for login/signup:** Set `NEXT_PUBLIC_APP_URL=https://tigerhire.io` in production. Without it, password reset and some redirects may use the wrong base URL.

### Optional (AI / features)

| Variable            | Source                |
| ------------------- | --------------------- |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENAI_API_KEY`    | platform.openai.com   |

If these are not set, AI-related features will be disabled; the app will still run.

### Supabase Auth — Production URL configuration

For customers and candidates to sign in at **tigerhire.io** (not localhost), configure Supabase to allow your production domain:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://tigerhire.io`
3. Under **Redirect URLs**, add (one per line):
   - `https://tigerhire.io/api/auth/callback`
   - `https://tigerhire.io/api/auth/callback/google`
     Add any other callback URLs your app uses (e.g. with `?next=...` if Supabase requires exact match).
4. Save. Ensure the project is **not paused** (free tier projects can auto-pause; resume in Dashboard if needed).

Until this is done, sign-in and sign-up from tigerhire.io can fail with connection errors because Supabase only allows requests from configured URLs.

**If you see a 404 on “authorize?provider=google&...” when clicking Google sign-in:**  
The app can proxy Supabase Auth through your domain so the browser only sees tigerhire.io. If you set `NEXT_PUBLIC_SUPABASE_URL=https://tigerhire.io`, you **must** also set `SUPABASE_INTERNAL_URL` to your real Supabase project URL (e.g. `https://xxxx.supabase.co`). The Next.js rewrites in `next.config.ts` forward `/auth/*` to that URL. Without `SUPABASE_INTERNAL_URL`, requests to `https://tigerhire.io/auth/v1/authorize?...` are not rewritten and Next.js returns 404 (there is no route for `/auth/v1/authorize`). Alternatively, set `NEXT_PUBLIC_SUPABASE_URL` to the real Supabase URL so the browser goes directly to Supabase (no proxy).

### External Services (when ready)

| Variable                             | Source                   |
| ------------------------------------ | ------------------------ |
| `STRIPE_SECRET_KEY`                  | Stripe Dashboard         |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard         |
| `STRIPE_WEBHOOK_SECRET`              | Stripe Webhooks          |
| `STRIPE_PRICE_STARTER`               | Stripe Products          |
| `STRIPE_PRICE_GROWTH`                | Stripe Products          |
| `STRIPE_PRICE_SCALE`                 | Stripe Products          |
| `STRIPE_PRICE_CANDIDATE_PRO`         | Stripe Products          |
| `RESEND_API_KEY`                     | Resend Dashboard         |
| `RESEND_FROM_EMAIL`                  | `noreply@tigerhire.io`   |
| `APIFY_API_TOKEN`                    | Apify Console            |
| `KV_REST_API_URL`                    | Vercel KV (auto-set)     |
| `KV_REST_API_TOKEN`                  | Vercel KV (auto-set)     |
| `SENTRY_DSN`                         | Sentry Project Settings  |
| `NEXT_PUBLIC_POSTHOG_KEY`            | PostHog Project Settings |
| `NEXT_PUBLIC_POSTHOG_HOST`           | PostHog Project Settings |

## 3. GitHub Actions Secrets

Add these to GitHub repo Settings > Secrets > Actions:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 4. Custom Domain

1. In Vercel Project > Settings > Domains, add `tigerhire.io`
2. Add the DNS records Vercel provides to your domain registrar
3. SSL is automatic
4. Update `NEXT_PUBLIC_APP_URL` to `https://tigerhire.io`

## 5. Cron Jobs

Cron jobs are configured in `vercel.json` and activate automatically on deploy:

- `process-signals`: every 4 hours
- `score-batch`: daily at 2:00 AM UTC
- `embed`: daily at 2:30 AM UTC

All cron routes require `Authorization: Bearer <CRON_SECRET>` header (Vercel injects this automatically).

## 6. Post-Deploy Verification

```bash
# Check the site loads
curl -I https://tigerhire.io

# Check API health
curl https://tigerhire.io/api/waitlist/count

# Check cron auth
curl -X POST https://tigerhire.io/api/cron/embed \
  -H "Authorization: Bearer <CRON_SECRET>"
```
