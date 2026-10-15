# WhatsApp outbound: why automated Meta messages may not arrive

TigerHire sends WhatsApp **through the Meta Cloud API** (`graph.facebook.com`), not through the Interakt REST client. Inbound webhooks can still be proxied by Interakt/Meta as long as POSTs reach `/api/webhooks/whatsapp` with a valid `x-hub-signature-256`.

**Meta “Flows” empty?** That is normal for this product: the hiring chat journey is implemented in TigerHire code + DB sessions, not Meta’s Flows builder. See [`WHATSAPP_META_FLOWS_CLARIFICATION.md`](./WHATSAPP_META_FLOWS_CLARIFICATION.md).

## 1. Software gates (most common)

### A. Production outbound hold

On **Vercel `VERCEL_ENV=production`**, real WhatsApp and email sends are **disabled** until you opt in:

```bash
OUTBOUND_NOTIFICATIONS_ENABLED=true
```

Until then, the app **logs** `[OUTBOUND_HOLD] would send WhatsApp (Meta)` and returns success **without** calling Meta. See [`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts) (`postMetaMessage` → `env.isProductionOutboundHold`).

**Fix:** In Vercel → Project → Settings → Environment Variables → **Production**, set `OUTBOUND_NOTIFICATIONS_ENABLED` to `true`, then redeploy.

Preview and local development **do not** use this hold (unless you also set sandbox below).

### B. WhatsApp sandbox mode

If `WHATSAPP_MODE=sandbox` (case-insensitive), every outbound is **skipped** and only logged as `[WHATSAPP_SANDBOX] would send Meta WhatsApp API`.

**Fix:** Remove `WHATSAPP_MODE` or set it to anything other than `sandbox` on the environment where you want real delivery.

### C. Missing Meta credentials

Sends need both:

- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp → API setup in Meta.
- `WHATSAPP_ACCESS_TOKEN` — long-lived System User token (or valid temporary token) with **whatsapp_business_messaging** (and related) permissions.

If either is empty, the code logs a warning and returns `{ success: false }` without calling Graph.

**Fix:** Regenerate token in Meta Business Suite / Developer app, paste into Vercel env, redeploy.

### D. Referrer OTP (`th_referrer_otp`) — Meta accepts but the phone shows nothing

Referrer verification uses the Meta template **`th_referrer_otp`** (`src/lib/services/referrer-otp.ts`, `scripts/create-whatsapp-templates.ts`). Common causes:

1. **`to` is not full international** — Meta expects digits only **with country code** (e.g. India `917…`, not a bare 10-digit local number). Public **`/refer/join`** uses a country picker; **`/dashboard/referrer`** setup and **`/candidate/profile`** OTP use a single field, so users often enter 10 digits only.  
   **Fix:** Set `WHATSAPP_OTP_DEFAULT_COUNTRY_CODE=91` (digits only) in Vercel when your beta is single-country (e.g. India) and users omit the country code. The server prefixes that code when the stored normalized number is exactly 10 digits. Leave **unset** for multi-country deployments.

2. **Template language** — the app tries `en` then `en_US`. A 404 `(#132001) … translation` on the first attempt is normal if only `en_US` exists in Meta; the second request should succeed.

3. **On the device** — Authentication messages may not banner. Search WhatsApp by the **business sending number** (Meta → WhatsApp Manager → Phone numbers); check **Archived** and (newer Android) the **Updates** tab.

4. **Logs** — Outbound previews go to **`whatsapp_message_log`** for this flow (not `wa_messages`). Filter `direction = 'outbound'` and `body_preview` containing `th_referrer_otp` or `Template: th_referrer_otp`.

5. **Cold number / new WABA** — Meta may return `wamid` for authentication templates but delivery is unreliable until the user has an open **customer-care session** (they messaged your business line first). **`/refer/join`** step 2 includes an **Open WhatsApp to TigerHire** button (`wa.me` + pre-filled “Hi”) so the user warms the session from the **same** number, then **Resend code**. Set **`NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER`** in Vercel to your **customer-facing** WABA E.164 (same number users should chat with); it defaults in code if unset — confirm it matches Meta.

---

## 2. Meta / product rules (messages “sent” but not received)

### A. 24-hour session window (free text)

`sendWhatsAppMessage` sends `type: "text"`. Meta only allows that **inside the customer care window** (roughly 24 hours after the user last messaged you). Outside the window, Meta returns an error; TigerHire may fall back to template `tigerhire_session_expired`, which **must exist and be approved** in your WABA.

**Fix:** Ensure that template is created and approved, or rely on user-initiated conversation + templates for first contact.

### B. Template names and categories

Lane-specific helpers (e.g. `th_job_match_result`, marketing templates) must **exactly** match names in Meta, with correct variable counts, and correct category (e.g. MARKETING requires opt-in where enforced).

**Fix:** Run template audit / creation scripts from repo docs (`npm run create:templates`, `scripts/audit-whatsapp-templates.mjs`) and align with [`WHATSAPP_RESPONSE_TEMPLATES.md`](./WHATSAPP_RESPONSE_TEMPLATES.md).

### C. Test phone numbers

In **development** mode on Meta, you can only message **allowed** test numbers. Add the recipient under Meta App → Roles / WhatsApp test numbers.

---

## 3. Inbound vs outbound (different env vars)

| Direction              | What must be correct                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inbound POST**       | `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` (preferred) for HMAC — **App Secret**, not the webhook verify token. Fallback: `WHATSAPP_WEBHOOK_SECRET`. |
| **Inbound GET verify** | `WHATSAPP_WEBHOOK_SECRET` must match Meta “Verify token”.                                                                                                 |
| **Outbound send**      | `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. **Not** the verify token.                                                                           |

Webhook working does **not** prove outbound tokens are set.

---

## 4. Message delivery status (webhook)

Meta sends **per-message** `statuses` (`sent`, `delivered`, `read`, `failed`) on the **`messages`** webhook field to `POST /api/webhooks/whatsapp`. TigerHire updates:

- `whatsapp_message_log.delivery_status` / `delivery_error` (matched by `wa_message_id`)
- `referrals.last_outreach_delivery_status` for the recipient phone (last 7 days)

On **`failed`**, the referrer may get a WhatsApp with a working `wa.me` warm-up link (uses `NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER` or default `919880444688`).

**Meta setup:** App → WhatsApp → Configuration → Webhook → Subscribe to **`messages`** (same callback URL as inbound). Without this field you only see API `wamid`, not real delivery.

```bash
node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs
```

Apply migration `supabase/migrations/20260520173155_whatsapp_message_delivery_status.sql` if columns are missing.

## 5. Template status (webhook + DB)

Meta sends `message_template_status_update` to `POST /api/webhooks/whatsapp`; rows land in `whatsapp_template_status`.

```bash
# Read webhook/API-populated rows (referral first-contact templates)
node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs

# Backfill from Meta Graph if webhook field is not subscribed yet
node --env-file=.env.local scripts/check-whatsapp-template-status-webhook.mjs --sync-meta
```

Super-admin UI: `GET /api/admin/whatsapp-templates`.

**Referral to a friend not arriving?** If `th_application_received` is **APPROVED** here, the failure is usually outbound hold, sandbox, cold-number delivery, or wrong phone — not template rejection.

## 6. Quick local check

```bash
node --env-file=.env.local scripts/diagnose-whatsapp-outbound.mjs
```

Then search deployment logs for:

- `[OUTBOUND_HOLD]`
- `[WHATSAPP_SANDBOX]`
- `Meta WhatsApp send failed`
- `Missing WHATSAPP_PHONE_NUMBER_ID`

---

## 7. Related docs

- [`WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md`](./WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md) — webhook routing.
- [`WHATSAPP_INTEGRATION_STEP_BY_STEP.md`](./WHATSAPP_INTEGRATION_STEP_BY_STEP.md) — setup.
- [`.env.example`](../.env.example) — all WhatsApp-related variables.
