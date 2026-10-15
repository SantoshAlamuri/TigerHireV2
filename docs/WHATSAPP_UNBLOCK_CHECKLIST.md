# WhatsApp not working? Do this in order

TigerHire talks to **Meta** in two ways: **messages in** (webhook) and **messages out** (Graph API). You need both working, plus one extra switch on **production**.

---

## The two different secrets (easy to mix up)

- **Verify token** → you choose a random string. Same value in Meta’s webhook screen **and** in Vercel as `WHATSAPP_WEBHOOK_SECRET`. Used for the **GET** “subscribe” check.
- **App secret** → copy from Meta **App → Settings → Basic** into Vercel as `WHATSAPP_META_APP_SECRET` (or `META_APP_SECRET`). Used for **POST** body signature. **Not the same as the verify token.**

If POST always returns **401**, the App secret is wrong or missing.

---

## Set these in Vercel, then redeploy

Every time you change env vars, **redeploy** (or wait for a new deployment).

1. `WHATSAPP_WEBHOOK_SECRET` — your verify token (must match Meta).
2. `WHATSAPP_META_APP_SECRET` or `META_APP_SECRET` — Meta **App secret** (for incoming POSTs).
3. `WHATSAPP_PHONE_NUMBER_ID` — from Meta WhatsApp → API setup.
4. `WHATSAPP_ACCESS_TOKEN` — long-lived System User token (this is what the app uses to **send**; it does **not** use `WHATSAPP_API_KEY` for Meta sends).
5. **Production only:** `OUTBOUND_NOTIFICATIONS_ENABLED` = `true` — without this on Vercel **production**, WhatsApp sends are **skipped** (log only).
6. **Remove** `WHATSAPP_MODE=sandbox` if you want real messages (sandbox = no real send).

---

## Steps (one path)

1. Put your **live site URL** in Meta (must be `https`, must be this project’s domain).
2. In Meta: Webhook URL = `https://YOUR-DOMAIN/api/webhooks/whatsapp`
3. In Meta: Verify token = same as `WHATSAPP_WEBHOOK_SECRET` in Vercel.
4. Redeploy. In Meta, click to **verify** the webhook (should succeed).
5. Add **App secret** to Vercel, redeploy.
6. Message your **business WhatsApp number** from a phone. Check Vercel logs: you want **200** on `POST /api/webhooks/whatsapp`, **not 401**.
7. Add **phone number id** + **access token**, redeploy.
8. If this is **production** on Vercel, set `OUTBOUND_NOTIFICATIONS_ENABLED=true`, redeploy.
9. **Referrer OTP only:** if users enter 10-digit local numbers without country code (common on dashboard/candidate OTP), set `WHATSAPP_OTP_DEFAULT_COUNTRY_CODE` (e.g. `91` for India). See [WHATSAPP_OUTBOUND_TROUBLESHOOTING.md](./WHATSAPP_OUTBOUND_TROUBLESHOOTING.md) §1.D.
10. Run `npm run whatsapp:diagnose-outbound` (with `.env` or Vercel env loaded locally if you use that).
11. **Check WABA + token on Meta (Graph):** `node --env-file=.env.local scripts/verify-whatsapp-waba.mjs` (uses `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` — same values as Vercel). Or `npm run whatsapp:verify-waba` after copying env to `.env.local`.
12. If messages still need **templates** (e.g. outside 24h window), create/approve them in **WhatsApp Manager** so names match the app (see `WHATSAPP_RESPONSE_TEMPLATES.md`).

---

## Quick fixes

- **No reply and logs say `OUTBOUND_HOLD`** → set `OUTBOUND_NOTIFICATIONS_ENABLED=true` on **production** and redeploy.
- **No reply and logs say `WHATSAPP_SANDBOX`** → turn off sandbox mode in env.
- **POST webhook 401** → fix `WHATSAPP_META_APP_SECRET` (must be App secret from Meta).
- **Still broken after review** → Meta may limit the token until App Review is done; use test WABA and test phone numbers in Meta.

---

## More detail (only if you need it)

- **Step-by-step (Meta + Vercel + project):** [WHATSAPP_SETUP_STEP_BY_STEP.md](./WHATSAPP_SETUP_STEP_BY_STEP.md)
- Deeper notes: [WHATSAPP_OUTBOUND_TROUBLESHOOTING.md](./WHATSAPP_OUTBOUND_TROUBLESHOOTING.md)
- Full walkthrough: [WHATSAPP_INTEGRATION_STEP_BY_STEP.md](./WHATSAPP_INTEGRATION_STEP_BY_STEP.md)
- Meta “Flows” empty: [WHATSAPP_META_FLOWS_CLARIFICATION.md](./WHATSAPP_META_FLOWS_CLARIFICATION.md)

Code paths: outbound [`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts), inbound [`src/app/api/webhooks/whatsapp/route.ts`](../src/app/api/webhooks/whatsapp/route.ts).
