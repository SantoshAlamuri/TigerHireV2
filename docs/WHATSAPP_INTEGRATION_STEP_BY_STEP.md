# WhatsApp Integration with TigerHire — Step-by-Step Guide

This guide walks you through connecting **WhatsApp** (via Interakt or Meta) to TigerHire so candidates can apply via WhatsApp: consent → CV → FitScore → apply by number.

---

## Prerequisites

- TigerHire deployed (e.g. on Vercel) with a public URL (e.g. `https://tigerhire.io` or your preview URL).
- **Interakt** account (recommended for outbound templates and single dashboard), or **Meta WhatsApp Business API** access.
- Supabase and other required env vars already set (see `.env.example`).

---

## Step 1 — Get WhatsApp / Interakt credentials

| Goal                             | Action                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interakt**                     | Sign up at [Interakt](https://www.interakt.ai/). In the dashboard, get your **API Key** (used for sending messages). Note your WhatsApp Business phone number and Phone Number ID if shown. |
| **Meta** (if not using Interakt) | Use [Meta Business Suite](https://business.facebook.com) → WhatsApp → API. Create an app, add WhatsApp product, get **Access Token** and **Phone Number ID**.                               |

You will need:

- **Webhook verify token** — Create a long random string (e.g. 32+ chars). This is your `WHATSAPP_WEBHOOK_SECRET`. Store it securely; you’ll set it in both TigerHire and Interakt/Meta.
- **Access token** — For Meta (this codebase), use a **System User** long-lived token → `WHATSAPP_ACCESS_TOKEN` (see [`WHATSAPP_UNBLOCK_CHECKLIST.md`](./WHATSAPP_UNBLOCK_CHECKLIST.md)).

---

## Step 2 — Set environment variables in TigerHire

In **Vercel** (or your host): Project → Settings → Environment Variables. Add:

| Variable                                        | Required                     | Description                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WHATSAPP_WEBHOOK_SECRET`                       | **Yes**                      | Same value as the “Verify token” you’ll set in Interakt/Meta. Used for GET verification and POST signature verification.                                        |
| `WHATSAPP_ACCESS_TOKEN`                         | **Yes (Meta send)**          | Long-lived **System User** token (Graph API). This repo’s [`whatsapp.ts`](../src/lib/services/whatsapp.ts) uses this for outbound — **not** `WHATSAPP_API_KEY`. |
| `WHATSAPP_PHONE_NUMBER_ID`                      | **Yes (Meta send)**          | From Meta → WhatsApp → API setup.                                                                                                                               |
| `OUTBOUND_NOTIFICATIONS_ENABLED`                | **Yes on Vercel production** | Set to `true` or **production** outbound WhatsApp is log-only ([`WHATSAPP_UNBLOCK_CHECKLIST.md`](./WHATSAPP_UNBLOCK_CHECKLIST.md)).                             |
| `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` | **Strongly recommended**     | Meta **App Secret** for inbound POST `x-hub-signature-256` (different from verify token).                                                                       |
| `WHATSAPP_API_KEY`                              | N/A in current send path     | Not read by `whatsapp.ts` for Meta Graph sends. Legacy/other tooling only, if any.                                                                              |

For **local** testing, add the same variables to `.env.local` (never commit this file).

- [ ] `WHATSAPP_WEBHOOK_SECRET` set (same as verify token in Step 3)
- [ ] `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` set (Meta Graph send)
- [ ] `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` set to Meta **App Secret** (inbound POST signature)
- [ ] Production: `OUTBOUND_NOTIFICATIONS_ENABLED=true` if you need real sends on Vercel production

---

## Step 3 — Configure webhook in Interakt (or Meta)

1. In **Interakt**: go to **WhatsApp → Configuration** (or **Webhook** / **Settings**).
2. Set **Callback URL** to:
   ```text
   https://<your-domain>/api/webhooks/whatsapp
   ```
   Examples:
   - Production: `https://tigerhire.io/api/webhooks/whatsapp`
   - Preview: `https://your-preview-url.vercel.app/api/webhooks/whatsapp`
3. Set **Verify token** to the **exact same value** as `WHATSAPP_WEBHOOK_SECRET` (e.g. the long random string from Step 1).
4. Subscribe to **messages** (inbound). Do **not** subscribe to other events unless you need them; TigerHire only needs inbound messages.
5. Save. Interakt/Meta will send a **GET** to your URL with `hub.mode=subscribe` and `hub.verify_token=<your token>`. TigerHire responds with `hub.challenge` → subscription becomes active.

**If using Meta directly:** WhatsApp → Configuration → Edit → set Callback URL and Verify token the same way.

- [ ] Callback URL = `https://<your-domain>/api/webhooks/whatsapp`
- [ ] Verify token = `WHATSAPP_WEBHOOK_SECRET`
- [ ] Subscribed to **messages**
- [ ] GET verification succeeds (no error in Interakt/Meta)

---

## Step 4 — Do not add extra inbound “workflows”

- **All** inbound messages must go to the **single** webhook URL above.
- Do **not** create separate Interakt “workflows” that handle the message first and then forward to TigerHire. That would break session state and the 24h window.
- TigerHire routes by **session state** (new → consent → CV → scored → slot_selection / vouch / complete) in `src/lib/whatsapp/handler.ts`.

- [ ] Confirmed: no extra inbound workflow intercepts messages; product-level webhook only

---

## Step 5 — Create message templates (Interakt)

TigerHire sends **session messages** inside the 24h window (free); outside 24h it uses **templates**. Create the **Interakt** templates from **`docs/WHATSAPP_RESPONSE_TEMPLATES.md`** with the exact names and parameter order there.

Summary: `tigerhire_session_expired` (1 param), `candidate_match_alert` (4), `recruiter_shortlist_ready` (3), `candidate_profile_claimed` (1), `candidate_contact_unlocked` (2), `waitlist_confirmation` (1). Language **en**.

- [ ] All Interakt templates from WHATSAPP_RESPONSE_TEMPLATES.md created with same names and parameter order
- [ ] Templates approved

---

## Step 6 — (Optional) Meta templates for consent and referral

If you use **Meta Graph API** for consent and referral (`WHATSAPP_PHONE_NUMBER_ID` set), create **tigerhire_consent_v1** and **tigerhire_referral_v1** in Meta WhatsApp Manager. Exact names and body params are in **`docs/WHATSAPP_RESPONSE_TEMPLATES.md`**. If you only use Interakt for sending, skip this step.

- [ ] If using Meta: tigerhire_consent_v1 and tigerhire_referral_v1 created and approved in Meta

---

## Step 7 — Deploy and verify webhook

1. Deploy TigerHire (e.g. push to main so Vercel deploys).
2. Ensure the deploy has the WhatsApp env vars (Step 2).
3. Trigger webhook verification from Interakt/Meta (e.g. “Test” or “Verify” in the dashboard). It should show success.
4. Send a test message to your WhatsApp Business number from a personal phone. Check:
   - Vercel logs (or your host logs) for `POST /api/webhooks/whatsapp` returning 200.
   - No 401 (signature) or 403 (verify) errors.

- [ ] Deploy completed with WhatsApp env set
- [ ] Webhook verification successful in Interakt/Meta
- [ ] Test inbound message received (logs show 200)

---

## Step 8 — End-to-end flow test

Run through the full candidate flow:

1. **New user** — Send “Hi” to your WhatsApp Business number.
2. **Consent** — You should get a consent message; reply **YES**.
3. **CV** — Send a **PDF** document (CV). TigerHire will run Scout (FitScore) and reply with “Got your CV. Scoring…” then top role matches.
4. **Apply** — Reply with a number (e.g. `1`) to apply to the first role. Confirm you get “interest sent…” and that an **application** exists for that job in TigerHire (Supabase or app UI).
5. **Optional** — Reply **MATCHES** to see the link to view matches in the app.

- [ ] New user → consent (YES) → welcome
- [ ] CV (PDF) → Scout runs → top matches shown
- [ ] Reply 1–N → application created for correct job/org
- [ ] MATCHES → link to app (if implemented)

---

## Step 9 — (Optional) FitScore and Scout tuning

For production you can tune match quality and cost:

| Env / constant            | Default     | Purpose                                    |
| ------------------------- | ----------- | ------------------------------------------ |
| `FITSCORE_MIN_CONFIDENCE` | 60          | Only show jobs with overall_score ≥ this.  |
| `FITSCORE_MIN_SKILLS`     | 50          | Only show jobs with skills_score ≥ this.   |
| `SCOUT_JOBS_LIMIT`        | 50          | Max open jobs Scout scores per CV.         |
| `TOP_MATCHES_LIMIT`       | 10 (max 20) | Number of roles shown in “reply 1–N” list. |

Set these in your environment if you want different behaviour (see `docs/WHATSAPP_SCALABLE_MULTI_ORG_DESIGN.md`).

- [ ] Optional: set `FITSCORE_MIN_CONFIDENCE`, `FITSCORE_MIN_SKILLS`, `SCOUT_JOBS_LIMIT`, `TOP_MATCHES_LIMIT`

---

## Quick checklist (copy and tick)

- [ ] WhatsApp/Interakt credentials and verify token created
- [ ] Env set: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY` (+ optional Meta vars)
- [ ] Interakt/Meta: Callback URL = `https://<your-domain>/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages**
- [ ] No extra inbound workflows; single webhook only
- [ ] Interakt templates created (§5) and approved
- [ ] Optional: Meta consent/referral templates if used
- [ ] Deploy and webhook verification success
- [ ] E2E test: new user → consent → CV → Scout → reply 1–N → application created

---

## Troubleshooting

| Issue                   | What to check                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 403 on GET verification | `hub.verify_token` must **exactly** match `WHATSAPP_WEBHOOK_SECRET`. Check for extra spaces, different env (e.g. preview vs production).                                                    |
| 401 on POST             | Signature verification failed. Ensure Interakt/Meta signs with the **same** secret as `WHATSAPP_WEBHOOK_SECRET`. Check `x-hub-signature-256` and raw body.                                  |
| No reply after message  | Check Vercel/host logs for errors in `handleInboundMessage`. Ensure Supabase is reachable and `whatsapp_sessions` exists. Scout needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for FitScore. |
| “Template not found”    | Template name and parameter order in Interakt must match `src/lib/services/whatsapp.ts` and `src/lib/whatsapp/templates.ts`. Use exact names (e.g. `tigerhire_session_expired`).            |

---

## References

- **Least-cost integration and copy:** `docs/WHATSAPP_LEAST_COST_INTEGRATION.md`
- **All response templates (Interakt + Meta):** `docs/WHATSAPP_RESPONSE_TEMPLATES.md`
- **What’s built and flow:** `docs/WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md`
- **Multi-org and scaling:** `docs/WHATSAPP_SCALABLE_MULTI_ORG_DESIGN.md`
- **Integration overview:** `docs/INTEGRATION_SYSTEM_CHECK.md`
- **Code:** `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/handler.ts`, `src/lib/services/whatsapp.ts`, `src/lib/whatsapp/templates.ts`
