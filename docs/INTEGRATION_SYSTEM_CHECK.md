# TigerHire — Integration System Check

**Generated:** Feb 25, 2026  
**Focus:** What’s done, what’s needed, and **email access** status.

---

## High priority: Email access

### Status: **Implemented but not required in env**

| Item                  | Status                     | Notes                                                                                                                                      |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Provider**          | Resend                     | `resend` package, `src/lib/services/resend.ts`                                                                                             |
| **Env vars**          | Optional in code           | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (default `noreply@tigerhire.io`)                                                                     |
| **Validation**        | Not required at startup    | `env.ts` does **not** include Resend in `REQUIRED_SERVER_VARS` or `envServerSchema`                                                        |
| **If key is missing** | Sends will fail at runtime | Resend client is created with `env.resendApiKey` (empty string if unset); `resend.emails.send()` will fail. No guard for “email disabled”. |

### What breaks without `RESEND_API_KEY`

These flows call Resend; they will throw or log and skip email if the key is missing:

| Flow                            | Where                                      | Impact without email                                                                         |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Contact form                    | `POST /api/contact`                        | Submission saved to DB; notification to `hello@tigerhire.io` not sent (errors logged + DLQ). |
| Team/organisation invite        | `POST /api/organisations/members` (invite) | Invite record can be created; invitee does **not** receive email.                            |
| Admin user invite               | `POST /api/admin/users`                    | Same as above.                                                                               |
| Application status update       | Pipeline stage change, `PATCH` application | Candidate does not get “shortlisted / hired / rejected” email.                               |
| FitScore shortlist ready        | Orchestrator / scoring                     | Recruiter does not get “shortlist ready” email.                                              |
| Interview booked                | `POST /api/jobs/[id]/interviews/book`      | Candidate does not get “interview scheduled” email.                                          |
| Interview cancelled/rescheduled | Cancel/reschedule APIs                     | No email to candidate/recruiter.                                                             |
| New message notification        | `POST /api/messages/[conversationId]`      | Recipient does not get message notification email.                                           |
| Job alerts (cron)               | `api/cron/job-alerts`                      | Candidates do not get match alert emails.                                                    |

### Recommended actions for email

1. **Set Resend in production**
   - Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel (and any other env) for production (and preview if you want emails there).
   - Resend Dashboard: https://resend.com (see also `DEPLOY.md`).

2. **Optional: make email required in production**
   - To fail fast if email is misconfigured, add `RESEND_API_KEY` to `REQUIRED_SERVER_VARS` and to `envServerSchema` in `src/lib/config/env.ts` for production only (so local/dev can still run without it if desired).

3. **Optional: graceful no-op when key is missing**
   - In `src/lib/services/resend.ts`, short-circuit all send functions when `!env.resendApiKey`: return a no-op result instead of calling Resend, and log that email is disabled. This avoids runtime errors when email is intentionally not configured (e.g. staging).

---

## Integrations overview

### Required (validated in production)

| Integration  | Env vars                                                                                 | Status                                  |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Required; validated at runtime in prod. |

| **Cron auth** | `CRON_SECRET` | Required for cron routes. |

---

### Implemented (code in place, env optional or external)

| Integration            | Env vars                                                                                           | Used for                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Resend (email)**     | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                              | Contact, invites, application updates, FitScore ready, interview booked/cancel/reschedule, message notifications, job-alert cron. |
| **Stripe**             | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs      | Checkout, portal, subscriptions.                                                                                                  |
| **WhatsApp**           | `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN` | Templates, webhook, candidate/recruiter flows.                                                                                    |
| **Google OAuth**       | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                         | SSO (e.g. `api/auth/sso`).                                                                                                        |
| **Anthropic / OpenAI** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`                                                              | FitScore agent, AI features.                                                                                                      |
| **Apify**              | `APIFY_API_TOKEN`                                                                                  | Scraping/signals (if used).                                                                                                       |
| **Sentry**             | `SENTRY_DSN`                                                                                       | Error reporting.                                                                                                                  |
| **PostHog**            | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`                                              | Analytics.                                                                                                                        |
| **Upstash Redis**      | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                               | Caching (e.g. auth profile).                                                                                                      |

---

### Planned / not yet implemented

| Integration             | Docs / BRD                                                 | Notes                                                                                            |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **LinkedIn OAuth**      | Launch plan, SSO                                           | SSO route supports provider; LinkedIn provider config may still be pending.                      |
| **Google Calendar**     | `docs/help/scheduling-interviews.md`, `REMAINING_TASKS.md` | For interview slot sync.                                                                         |
| **Outlook Calendar**    | Launch plan                                                | Optional alongside Google.                                                                       |
| **ATS (e.g. HiBob)**    | BRD, `archive/2026-q1-q2/APRIL_2ND_LAUNCH_PLAN.md`         | Phase 5 / P2; not in codebase yet.                                                               |
| **Video interview**     | Launch plan                                                | P2; not in codebase yet.                                                                         |
| **Interakt (WhatsApp)** | BRD                                                        | BRD mentions “WhatsApp notifications via Interakt”; current code uses generic WhatsApp API keys. |

---

## Workflows and webhooks

WhatsApp flows are driven by **webhooks**; workflow definitions live in Interakt’s dashboard, not in this repo.

1. **Interakt** (or Meta) sends inbound messages to TigerHire at **`POST /api/webhooks/whatsapp`**. The handler in `src/lib/whatsapp/handler.ts` expects a "Meta/Interakt style" payload.
2. **Workflows** (e.g. in Interakt’s Workflows UI) are **created and edited in Interakt’s dashboard**. You configure each workflow to trigger on events and to call your **webhook URL**:  
   `https://<your-domain>/api/webhooks/whatsapp`
3. When a workflow runs, Interakt **calls that webhook** with the event/message payload. TigerHire runs the logic in `handleInboundMessage` (CV handling, "reply 1 to N" for matches). We do **not** create or update workflows via API from this codebase; we only **receive** webhook calls.

**Scalability:** The number of role matches shown in those flows is controlled by TigerHire: `TOP_MATCHES_LIMIT` in `src/lib/whatsapp/constants.ts` and env `TOP_MATCHES_LIMIT` (default 10, max 20). Increasing it makes the "reply by number" flow scalable beyond 3–4 roles without changing workflow definitions in Interakt.

---

## Candidate communication: both channels, WhatsApp primary

We use **both email and WhatsApp** for candidate touchpoints. **WhatsApp is the primary channel** (main engagement, time-sensitive flows); **email is supporting** (paper trail, in-app users, preferences).

- **Shortlist / outreach:** WhatsApp sent first, then email. Email copy references WhatsApp (e.g. "We've sent you a message on WhatsApp with next steps").
- **Interview slots, reminders, FitScore results:** Delivered via WhatsApp (and email where applicable). Critical flows (slots, apply-by-reply) are WhatsApp-first.
- **Hire / reject notifications:** Email when we have address; can be extended to WhatsApp as primary if needed.
- New flows should send **both** when we have both contact details, with **WhatsApp first** and copy that directs attention there where relevant.

---

## Quick checklist

- [ ] **Email:** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` set in production (Vercel).
- [ ] **Email (optional):** Add Resend to required server env in prod, or add no-op when key missing.
- [ ] **Supabase:** Required vars set; email confirmation and auth settings per `docs/V5_DEPLOYMENT_CHECKLIST.md`.
- [ ] **Stripe:** Keys and webhook secret set if billing is live.
- [ ] **WhatsApp:** Keys and webhook set if WhatsApp flows are live.
- [ ] **SSO:** Google (and LinkedIn if desired) OAuth env set for sign-in.
- [ ] **Cron:** `CRON_SECRET` set and Vercel cron auth verified.

---

## References

- Env and validation: `src/lib/config/env.ts`
- Email service and templates: `src/lib/services/resend.ts`, `src/lib/services/email-templates.ts`
- Deploy env list: `DEPLOY.md`
- Supabase/Vercel checklist: `docs/V5_DEPLOYMENT_CHECKLIST.md`
- Launch scope (historical April-2 cycle, archived 2026-05-12): `docs/archive/2026-q1-q2/APRIL_2ND_LAUNCH_PLAN.md`, `docs/archive/2026-q1-q2/APRIL_2ND_LAUNCH_EXECUTIVE_SUMMARY.md`. **Current beta-launch scope**: `docs/launch/PRE-LAUNCH-INFRA-CHECKLIST.md`.
