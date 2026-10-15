# Meta “Flows” vs TigerHire — what you actually need

If you opened **Meta Business Suite / WhatsApp Manager** and saw **Flows** empty or “not configured,” that is **expected** for the way TigerHire is built today.

## Two different meanings of “flow”

| Term                            | What it is                                                                                                            | Required for TigerHire?                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Meta WhatsApp Flows**         | Meta’s product for **structured screens/forms inside WhatsApp** (Flow JSON, Flow endpoint, etc.).                     | **No.** TigerHire does not drive the candidate journey through Meta Flows. |
| **TigerHire conversation flow** | **Session state** in your database + logic in `handleInboundMessage` (consent → CV → scored → apply by number, etc.). | **Yes — but this lives in your app**, not in Meta’s Flows UI.              |

So: **not having Meta Flows configured does not, by itself, explain missing automation** — as long as webhook, templates (where used), phone number ID, and access token are correct.

## What you **do** configure in Meta for TigerHire

1. **Webhook** — Callback URL `https://<your-host>/api/webhooks/whatsapp`, verify token matching `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages** (and optionally statuses). See [`WHATSAPP_INTEGRATION_STEP_BY_STEP.md`](./WHATSAPP_INTEGRATION_STEP_BY_STEP.md).
2. **Message templates** — Names and parameter order must match what the code sends (see [`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts) and [`WHATSAPP_RESPONSE_TEMPLATES.md`](./WHATSAPP_RESPONSE_TEMPLATES.md)). **UTILITY** vs **MARKETING** must match how you submit them in Meta.
3. **API credentials** — `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (system user token with messaging scopes).
4. **Production sends** — On Vercel production, `OUTBOUND_NOTIFICATIONS_ENABLED=true` or outbound is log-only ([`WHATSAPP_OUTBOUND_TROUBLESHOOTING.md`](./WHATSAPP_OUTBOUND_TROUBLESHOOTING.md)).

Outbound traffic uses the **Meta Cloud API** (`graph.facebook.com`) from [`src/lib/services/whatsapp.ts`](../src/lib/services/whatsapp.ts), not Meta’s Flows runtime.

## What to avoid

- **Do not** add a Meta or BSP **inbound workflow** that handles the conversation **before** your webhook. Inbound must hit TigerHire first so session state stays consistent ([`WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md`](./WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md)).

## If you _want_ Meta Flows later

That would be a **product change**: new message types, Flow token handling, and mapping Flow responses into `whatsapp_sessions`. It is not part of the current documented candidate path.
