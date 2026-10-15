# WhatsApp Integration — Next Steps to Test

Follow these in order. Use **production** (Vercel) if your webhook URL is live; use **local + tunnel** only for debugging before deploy.

---

## Before you test

- [ ] **Env set** — `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY` in Vercel (or `.env.local` for local). Same values as in Interakt.
- [ ] **Webhook configured in Interakt** — Callback URL = `https://<your-domain>/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages**.
- [ ] **Interakt templates** — At least `tigerhire_session_expired` created and approved (others as you enable features). See `docs/WHATSAPP_RESPONSE_TEMPLATES.md`.
- [ ] **Supabase** — Required env vars set; `whatsapp_sessions` table exists (migration applied).
- [ ] **FitScore (optional but needed for full flow)** — `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set so Scout can score CVs.

---

## Step 1 — Verify webhook (GET)

1. In Interakt, open webhook configuration and **Save** or click **Verify**.
2. Interakt sends `GET https://<your-domain>/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<secret>&hub.challenge=xxx`.
3. **Success:** Interakt shows verified / no error.
4. **Failure (403):** Verify token in Interakt **exactly** matches `WHATSAPP_WEBHOOK_SECRET` (no spaces, same env as the deploy).

---

## Step 2 — Verify inbound (POST)

1. From your **personal phone**, send any message (e.g. **Hi**) to your **WhatsApp Business** number.
2. Check **host logs** (Vercel → Project → Logs, or terminal if local): look for `POST /api/webhooks/whatsapp` returning **200**. No 401 (signature) or 500.
3. **If 401:** Interakt must sign the body with the same secret as `WHATSAPP_WEBHOOK_SECRET`. Check webhook secret in Interakt matches env.
4. **If 200 but no reply:** Handler may be failing async. Check logs for errors from `handleInboundMessage`; ensure Supabase and (if consent flow is on) feature flag / consent service are ok.

---

## Step 3 — End-to-end flow test

Use a **new** phone number (or one not yet in `whatsapp_sessions`) so you go through the full flow.

| #   | You do                       | Expected response                                                                     |
| --- | ---------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Send **Hi**                  | Consent message (or welcome, if consent flow disabled).                               |
| 2   | Reply **YES**                | Welcome + “Drop your CV (PDF)…”.                                                      |
| 3   | Send a **PDF** (e.g. CV)     | “Got your CV. Scoring now…” then (after ~1–2 min) list of roles with “Reply 1 to N…”. |
| 4   | Reply **1** (or 2, 3…)       | “Interest sent to [Company] for [Role]…”.                                             |
| 5   | (Optional) Reply **MATCHES** | Message with link to app to view matches.                                             |

**Verify in Supabase (or app UI):**

- Row in **`whatsapp_sessions`** for your phone with state moving: `new` → `awaiting_consent` → `consent_given` / `cv_requested` → `cv_received` → `scored` → `complete`.
- After step 3: **`fit_scores`** and/or **`candidates`** for your CV.
- After step 4: **`applications`** row for the job you chose.

---

## Step 4 — Optional tests

- **24h template fallback:** Wait 24+ hours (or temporarily set `last_candidate_message_at` in DB to the past), then send a message. You should get a reply via **tigerhire_session_expired** template (if approved).
- **Referral (WhatsApp):** From a number that has a profile with that phone, send: **Refer John — Backend — Bangalore**. You should get “What is John’s WhatsApp number?”; reply with a number; that number should get the referral welcome.
- **Employee referral (app):** POST `/api/employees/refer` with job_id, candidate_phone, candidate_name (as employee). Candidate should get **tigerhire_referral_v1** (if Meta is configured) or session message; when they message, they should see referred consent/welcome.

---

## If something fails

| Symptom              | Check                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 403 on verify        | `WHATSAPP_WEBHOOK_SECRET` === Interakt verify token.                                                                  |
| 401 on message       | Webhook secret used for signature === `WHATSAPP_WEBHOOK_SECRET`.                                                      |
| No reply, 200        | Logs for `handleInboundMessage` / Scout errors; Supabase connectivity; `whatsapp_sessions` exists; AI keys for Scout. |
| Consent never sent   | Feature flag `consent_flow` (if used); Meta template approved when using Meta for consent.                            |
| “Template not found” | Template name and body params in Interakt match `docs/WHATSAPP_RESPONSE_TEMPLATES.md`.                                |
| Scout doesn’t run    | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set; no errors in Scout step in logs.                                         |

---

## Quick checklist (copy and tick)

- [ ] Env and webhook configured; GET verification succeeds
- [ ] POST returns 200 when you send a message to the business number
- [ ] New user: Hi → consent (YES) → welcome
- [ ] CV (PDF) → “Got your CV. Scoring…” → list of roles
- [ ] Reply 1–N → “Interest sent…” and application in DB
- [ ] Optional: MATCHES, 24h fallback, or referral flow
