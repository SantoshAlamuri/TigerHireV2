# WhatsApp: step-by-step (Meta + Vercel + your project)

Do the sections **in order**. You need a **public `https` URL** for the webhook (usually your Vercel deployment).

---

## Before anything

- Have **Meta Business** access and a **WhatsApp Business Account (WABA)** (Meta creates a test WABA when you add the WhatsApp product).
- Deploy TigerHire to **Vercel** (or know your **Preview** URL like `https://xxx.vercel.app`) — the webhook URL will use that host.
- You do **not** need to change application code for a standard setup: webhook and send paths already exist. You only configure **Meta**, **Vercel env**, and **`.env.local`** for local tests.

---

## Part 1 — Vercel (get the URL first)

1. **Connect the GitHub repo** to Vercel (if it is not already) and run a **successful deploy** to at least one environment.
2. Copy your **production** URL (e.g. `https://tigerhire.io` or `https://your-app.vercel.app`). You will use it in Part 2.
3. (Optional) Add **Preview** for testing: same env vars can be set under **Preview** later, or use Production only.

**You will come back to Vercel in Part 3** to paste secrets.

---

## Part 2 — Meta (app, WhatsApp, token, webhook)

### 2.1 Create the app and add WhatsApp

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create app** (type **Business** is fine) → add product **WhatsApp**.

### 2.2 Copy IDs and secrets (for Vercel later)

From **Meta app dashboard**:

| What                   | Where to find it                                    | You will put in Vercel as                           |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------- |
| **App ID**             | App → **Settings** → **Basic**                      | (for your notes; not always required in env)        |
| **App secret**         | **Settings** → **Basic** → _Show_                   | `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET`     |
| **Phone number id**    | **WhatsApp** → **API Setup** (or _Getting started_) | `WHATSAPP_PHONE_NUMBER_ID`                          |
| **WABA id** (optional) | API Setup; or Business settings                     | `WHATSAPP_WABA_ID` (optional, for template scripts) |

**Generate a long random string** in a password manager — this is your **verify token** (only you and Vercel know it; Meta stores what you type in the webhook form). You will set it as `WHATSAPP_WEBHOOK_SECRET` in Vercel **and** the same value in Meta’s webhook “Verify token”.

### 2.3 Long-lived access token (for sending messages)

1. **Meta Business settings** (business.facebook.com) → **Users** → **System users** (or use the temporary token in API setup only for a quick test — for production, use a **System user**).
2. Create a system user → **Assign assets** → your **WABA** (full access as Meta allows).
3. **Generate token** with at least: **`whatsapp_business_messaging`** (and `whatsapp_business_management` if you use template management APIs/scripts).
4. Save that token as **`WHATSAPP_ACCESS_TOKEN`** in Vercel (Part 3).

### 2.4 Configure the webhook in Meta (points at TigerHire)

1. In the app: **WhatsApp** → **Configuration** (webhook).
2. **Callback URL:**  
   `https://<YOUR-VERCEL-HOST>/api/webhooks/whatsapp`  
   Example: `https://tigerhire.io/api/webhooks/whatsapp`
3. **Verify token:** paste the **same** long random string you will use for `WHATSAPP_WEBHOOK_SECRET`.
4. **Subscribe to field:** `messages` (required). Save.
5. Click to **verify** / complete subscription — Meta sends a **GET**; if it fails, the URL or token does not match Vercel (fix Part 3, redeploy, try again).

### 2.5 Test number (dev / pre-live)

- In **Development** mode, Meta may only let you message **allowed** numbers. Add test phone numbers in the app **Roles** / WhatsApp test settings if Meta still shows that flow.

**Do not** build a Meta “Flows” conversation UI for the default path — routing is in TigerHire’s server. See [WHATSAPP_META_FLOWS_CLARIFICATION.md](./WHATSAPP_META_FLOWS_CLARIFICATION.md) if the Flows screen is empty.

---

## Part 3 — Vercel (environment variables and redeploy)

1. Open **Vercel** → your project → **Settings** → **Environment Variables**.

2. Add for **Production** (and **Preview** if you test on preview URL):

| Name                                            | Value                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `WHATSAPP_WEBHOOK_SECRET`                       | Your **verify token** (must match Meta webhook)                                                                                            |
| `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` | **App secret** from Meta (for POST signature — **not** the verify token)                                                                   |
| `WHATSAPP_PHONE_NUMBER_ID`                      | From Meta WhatsApp API setup                                                                                                               |
| `WHATSAPP_ACCESS_TOKEN`                         | System user long-lived token                                                                                                               |
| `NEXT_PUBLIC_APP_URL`                           | Your public origin, e.g. `https://tigerhire.io` (no trailing `/`)                                                                          |
| `OUTBOUND_NOTIFICATIONS_ENABLED`                | `true` — **required on Vercel Production** for real sends ([WHATSAPP_OUTBOUND_TROUBLESHOOTING.md](./WHATSAPP_OUTBOUND_TROUBLESHOOTING.md)) |
| (Optional) `WHATSAPP_WABA_ID`                   | If you use template scripts from the repo                                                                                                  |

3. **Do not** set `WHATSAPP_MODE=sandbox` on production if you want real API sends.

4. **Save**, then **Redeploy** the latest deployment (Deployments → … → **Redeploy**), or push a small commit. Env vars are applied on **new** builds.

5. Go back to **Meta** → Webhook and **verify** again if the first try failed (after redeploy with `WHATSAPP_WEBHOOK_SECRET`).

---

## Part 4 — In your project (code on your machine)

1. **Clone** the repo and `npm install` (normal setup).

2. For **local** testing, copy **`.env.example`** → **`.env.local`** and add the same WhatsApp variables as in Vercel. **Never commit** `.env.local`.

3. **You do not need to change** `src/app/api/webhooks/whatsapp` or `src/lib/services/whatsapp.ts` for a standard connection — they are already implemented.

4. **Optional checks from the repo root:**
   - `npm run whatsapp:verify-webhook -- --url https://YOUR-HOST` — confirms GET challenge (needs `WHATSAPP_WEBHOOK_SECRET` in env).
   - `npm run whatsapp:diagnose-outbound` — shows if production hold or sandbox block sends.

5. **ngrok (only if you test webhooks on localhost):** run `ngrok http 3000`, put the **https** ngrok URL in Meta as callback, and run `npm run dev` with the same secrets — still use `/api/webhooks/whatsapp`.

---

## Part 4.5 — Optional: confirm WABA + token (Graph API)

With the same `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` as in Vercel, from the repo:

```bash
node --env-file=.env.local scripts/verify-whatsapp-waba.mjs
```

or `npm run whatsapp:verify-waba` if your shell has those variables set.

This **only reads** phone + WABA + a sample of templates from Meta. If it passes, your **access token** is valid for that phone/WABA. It does **not** test the Vercel webhook (do that in Part 5).

---

## Part 5 — Test (prove it works)

1. **Inbound:** From your phone, send a message **to the WhatsApp Business number** shown in Meta. In **Vercel** → **Logs** (or your function logs), look for `POST /api/webhooks/whatsapp` with status **200**. If **401**, fix `WHATSAPP_META_APP_SECRET` to match the Meta App secret, redeploy, retry.
2. **Outbound:** After consent/CV flow or any path that calls send, you should see a reply. If **nothing** on the phone and logs show `OUTBOUND_HOLD`, set `OUTBOUND_NOTIFICATIONS_ENABLED=true` for **production** and redeploy.
3. **Templates:** First messages outside a user session may require **approved templates** in **WhatsApp Manager** — names must match what the code uses ([`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts), [WHATSAPP_RESPONSE_TEMPLATES.md](./WHATSAPP_RESPONSE_TEMPLATES.md)).

---

## One-page memory aid

- **Meta:** App secret + phone number id + long-lived token + webhook URL + verify token + `messages` subscribed.
- **Vercel:** same secrets as env, **`OUTBOUND_NOTIFICATIONS_ENABLED=true`** on production, **redeploy** after changes.
- **Code:** only **`.env.local`**, no app code changes for default WhatsApp; use scripts above to verify.

**Short troubleshooting:** [WHATSAPP_UNBLOCK_CHECKLIST.md](./WHATSAPP_UNBLOCK_CHECKLIST.md)
