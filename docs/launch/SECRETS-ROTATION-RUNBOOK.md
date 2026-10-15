# Secrets rotation runbook (TigerHire)

**Purpose:** If a key leaks, rotate in the **provider** first, then **Vercel** (or your host) env, then **redeploy** so serverless runtimes pick up the new value. This doc does not store actual secrets.

**Current product context (2026-05-12):**

- **Stripe** is in dormant state for the beta — customer billing is handled manually outside the product. The `STRIPE_*` env vars may or may not be set in production. Code is intact, so rotation steps still apply if/when billing is reactivated.
- **OpenAI** is part of the FitScore Stage 2A extraction pipeline behind `USE_HYBRID_STAGE2=true`. Without the key, the pipeline falls back to Claude — no crash.
- **Sentry DSN** is wired both server-side (`SENTRY_DSN`) and client-side (`NEXT_PUBLIC_SENTRY_DSN`) — both must be rotated together if the DSN regenerates.
- **PostHog key** is `NEXT_PUBLIC_POSTHOG_KEY` (project key, not personal API key). The project key is intentionally public-by-design in client bundles.

**Vercel:** [Project → Settings → Environment Variables](https://vercel.com/docs/environment-variables) — add/update per environment (Production / Preview), then **Redeploy** the latest deployment. See also internal: `vercel env` CLI with a token (do not commit tokens).

| Secret / key                                                                         | Where to rotate                                                                                                                                                                        | Re-deploy                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                                                          | [Supabase Dashboard](https://supabase.com/dashboard) → Project **Settings** → **API** → _service role_ (regenerate if available, or use project pause/migrate path per Supabase docs). | Yes — all functions using admin client.                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                      | Supabase **Settings** → **API** (anon is tied to project JWT; rotation usually means project or key regen in dashboard).                                                               | Yes — new client sessions need new public key.           |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **API keys** / **Webhooks** (rolling secret).                                                                      | Yes after updating webhook **Signing secret** in Vercel. |
| `WHATSAPP_ACCESS_TOKEN`                                                              | [Meta for Developers](https://developers.facebook.com) → app → **WhatsApp** / **System User** or token in Business Manager.                                                            | Yes. Re-test a template send.                            |
| `WHATSAPP_PHONE_NUMBER_ID`                                                           | Rarely rotates; if wrong number, update to correct Phone Number ID in Meta.                                                                                                            | Yes.                                                     |
| `WHATSAPP_WEBHOOK_SECRET`                                                            | Set new verify token in **Meta** app webhook + match in Vercel.                                                                                                                        | Yes.                                                     |
| `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET`                                      | Meta app **Settings** → **Basic** → _App secret_ (Show/Reset).                                                                                                                         | Yes — used for HMAC on inbound.                          |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`                                               | Provider console: revoke old key, create new, paste in Vercel.                                                                                                                         | Yes.                                                     |
| `RESEND_API_KEY`                                                                     | [Resend](https://resend.com) **API keys** — rotate, update `RESEND_API_KEY` (and `RESEND_FROM_EMAIL` domain alignment if you change domain).                                           | Yes.                                                     |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`                                | [Upstash](https://console.upstash.com) **Redis** — rotate or recreate DB, update both vars.                                                                                            | Yes.                                                     |
| `CRON_SECRET` (or `CRON_SECRET_HASH`)                                                | Generate a new strong secret; if using **hash** in prod, re-hash and set `CRON_SECRET_HASH` only.                                                                                      | Yes — cron HMAC callers must use new value.              |
| `INNGEST_EVENT_KEY`                                                                  | [Inngest](https://app.inngest.com) → env / keys.                                                                                                                                       | Yes for event sources using it.                          |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`                                          | [Google Cloud Console](https://console.cloud.google.com) **Credentials** — create new OAuth client or rotate secret.                                                                   | Yes.                                                     |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`                                                   | Adzuna **API** dashboard.                                                                                                                                                              | Redeploy if you use those pipelines.                     |
| `VERCEL_API_TOKEN` (if used)                                                         | [Vercel](https://vercel.com/account/tokens).                                                                                                                                           | Re-run any scripts using the token.                      |
| `SUPABASE_MANAGEMENT_TOKEN` (if used)                                                | Supabase **Access tokens** in account.                                                                                                                                                 | Re-run management scripts.                               |
| Sentry DSNs (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` if any)                         | [Sentry](https://sentry.io) project **Settings** → _Client Key_ / rotation policy.                                                                                                     | Yes.                                                     |
| PostHog key                                                                          | PostHog project **Settings**.                                                                                                                                                          | Yes.                                                     |
| `APIFY_API_TOKEN`                                                                    | [Apify](https://console.apify.com) **Integrations** → **API token**.                                                                                                                   | Yes.                                                     |

**After a leak of database credentials:** assume API keys in DB (tokens, etc.) may be exposed; consider rotating third-party API keys in use by stored integrations, in addition to `SUPABASE_SERVICE_ROLE_KEY` per Supabase guidance.

**Not secrets but critical:** `NEXT_PUBLIC_APP_URL`, OAuth redirect URLs in Google/Meta, Stripe webhook URL, and WhatsApp webhook URL in Meta must still **match** production after any domain or redirect change.

---

## Internal sign-off (required for the launch checklist)

The `docs/launch/PRE-LAUNCH-INFRA-CHECKLIST.md` row "Secrets rotation runbook completed and approved (internal)" needs a named approver before beta GO.

| Field                                | Value                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Approver name                        | Engineering (4-week sprint sign-off)                                     |
| Approval date (UTC)                  | 2026-05-17                                                               |
| Reviewed against env vars in Vercel? | yes — table above covers all secret classes referenced in `.env.example` |
| Tested a dry-run rotation?           | no — optional before GA; runbook steps verified against provider docs    |
