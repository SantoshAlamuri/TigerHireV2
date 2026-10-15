# WhatsApp inbound conventions

## Two different fixes for two different latencies

Do **not** use the typing indicator as a stand-in for long scoring waits: Meta’s typing UI **auto-dismisses after about 25 seconds** (and when the business sends the next message). **Typing + read receipt** address the **inbound → first bot reply** gap (immediate feedback right after webhook receipt). **Interim user-visible text** addresses **multi‑tens‑of‑seconds scoring** (e.g. Lane A line before `computeFitScore`, or the “evaluating…” line after picking a job in role-guided flow). Someone proposing “just extend typing across scoring” should read this section first — **typing cannot replace interim copy for operations longer than ~25s.**

## Read receipt + typing (perceived latency)

All candidate/referrer traffic that enters through **`POST /api/webhooks/whatsapp`** gets a **read receipt + typing indicator** centrally: the route registers `sendTypingIndicator(wamid)` inside Next.js **`after()`**, before `handleInboundMessage`. Do **not** duplicate that call inside feature handlers unless you introduce a **second inbound entrypoint** (new route or server action that processes Meta payloads). If you add one, call `sendTypingIndicator` first there too, or route everything through the existing webhook.

- **`after()`** must stay **non-blocking**: register `after(...)`, then `return` the JSON response — never `await after(...)`.
- **Retries:** Meta may retry webhooks; idempotency may dedupe handler work but typing can still run more than once per `wamid`. Harmless for UX; logs may look noisy.
- **Rate limit:** When the per-phone webhook rate limit trips, we intentionally skip typing and handler work. Follow-up idea (not implemented): send a one-line “catching up” text so the thread is not totally silent.

## Lane-specific copy

**Tester note (referral / plain-text path):** Flows like **“Refer Alice — … → CV PDF”** with **no** apply/campaign deep link that sets `job_id` on the webhook (`payload.extracted` in `handler.ts`) go through **role picker / `startRoleGuidedFlow`**, **not** Lane A. You will **not** see the Lane A–only “~60 seconds before scoring” line on that CV upload; you **will** see the long **“Perfect. I am now evaluating…”** message **after** you reply with a **numbered job** in `handleRoleJobSelectionReply`. Saying “nothing changed” after only that path is a **false negative** for the Lane A interim. To exercise **Lane A** explicitly, use inbound context that pre-sets **`job_id`** (button/list/context payload per `normalizeWhatsAppWebhookBody` → `handler` merge).

**Lane A** (session already has `job_id`, usually from apply deep links / campaign button payloads merged in `handler.ts` from `payload.extracted`) runs **`handleLaneASingleJobScore`**, which sends an interim “~60 seconds” text immediately before **`computeFitScore`**. The generic multi-role path uses **`handleRoleJobSelectionReply`**, which already sends its own “evaluating…” line before scoring — do not assume the Lane A interim runs on every CV upload.

## Manual QA bar

See `docs/WHATSAPP_CANDIDATE_INTERACTION_TEST_PLAN.md` and `docs/SPRINT1_REFERRAL_CONSENT_VERIFICATION_RUNBOOK.md` for typing + consent checkpoints.

## Post-ship soak (48h)

Structured log events and SQL for Lane A vs role-picker: **`docs/verification/WHATSAPP_PERCEIVED_LATENCY_48H_SOAK.md`**.
