# What’s Built & How to Configure WhatsApp Workflows

This doc describes what TigerHire implements for WhatsApp and how to configure it in Interakt (or Meta) so inbound messages hit our app and outbound templates work.

---

## 1. What’s built (overview)

| Layer              | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Webhook**        | `GET` for hub verification; `POST` for every inbound message (Meta/Interakt style).                              |
| **Handler**        | Routes by **session state** (stored in DB). One state per phone number.                                          |
| **Session states** | new → consent → CV → scored / slot_selection / vouch / complete.                                                 |
| **Outbound**       | **Interakt** for most messages (session + templates). **Meta Graph** used for consent & referral templates only. |

---

## 2. Webhook endpoint

| Method   | URL                                           | Purpose                                        |
| -------- | --------------------------------------------- | ---------------------------------------------- |
| **GET**  | `https://<your-domain>/api/webhooks/whatsapp` | Hub verification (Meta/Interakt subscription). |
| **POST** | `https://<your-domain>/api/webhooks/whatsapp` | Inbound message delivery.                      |

**Query params for GET (verification):**

- `hub.mode` = `subscribe`
- `hub.verify_token` = value of env **`WHATSAPP_WEBHOOK_SECRET`**
- `hub.challenge` = string to return in response body (200, text/plain)

**POST:**

- **Signature:** Header `x-hub-signature-256` = `sha256=<hex>`. We verify with HMAC-SHA256 using `WHATSAPP_WEBHOOK_SECRET`.
- **Body:** JSON with `messages[]` (and optionally `contacts[]`). We use the first message: `from` (phone), `type` (text | document | image), `text.body` or `document`/`image` details.

---

## 3. Configure in Interakt / Meta

### 3.1 Webhook URL (inbound)

1. In **Interakt** (or Meta WhatsApp Manager): go to WhatsApp → Configuration / Webhook.
2. Set **Callback URL** to:
   ```text
   https://<your-domain>/api/webhooks/whatsapp
   ```
   Example: `https://tigerhire.io/api/webhooks/whatsapp` or your Vercel URL.
3. Set **Verify token** to the **exact same value** as your env var **`WHATSAPP_WEBHOOK_SECRET`** (e.g. a long random string). Our `GET` handler returns the `hub.challenge` only when `token === env.whatsappWebhookSecret`.
4. Subscribe to **messages** (and optionally message_echoes if you need them). We only need inbound **messages**.
5. Save. Interakt/Meta will send a GET; we respond 200 with `challenge` → subscription is active. All inbound messages will then be sent to our POST URL.

**No per-flow “workflows” needed for routing:** TigerHire does all routing by session state. You point Interakt/Meta at this **single** webhook URL; we handle consent, CV, FitScore, apply-by-number, slots, vouch, etc. internally.

### 3.2 “Workflows” in Interakt dashboard

If Interakt has a **Workflows** UI (e.g. automation rules):

- **Inbound:** Do **not** create separate workflows that “handle” the message and then call our URL. Instead, configure the **product-level webhook** (above) so that **all** inbound messages go to `POST /api/webhooks/whatsapp`. Our app is the single handler.
- **Outbound:** Workflows that _trigger_ outbound messages (e.g. “send template when X happens”) can call **TigerHire APIs** that in turn send WhatsApp (or you use Interakt’s own send from their UI). Templates used by TigerHire must exist in Interakt (and/or Meta) as below.

### 3.3 Environment variables (TigerHire)

| Variable                     | Used for                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **WHATSAPP_WEBHOOK_SECRET**  | Verify token (GET) and signature verification (POST). **Required.**                                        |
| **WHATSAPP_API_KEY**         | Interakt: Basic auth for `api.interakt.ai` outbound. Meta: Bearer for Graph API when using `templates.ts`. |
| **WHATSAPP_PHONE_NUMBER_ID** | Only for Meta Graph API (e.g. `templates.ts`). Optional if you only use Interakt for send.                 |
| **WHATSAPP_ACCESS_TOKEN**    | Optional; used for downloading media from webhook payload. Falls back to WHATSAPP_API_KEY.                 |

Set these in Vercel (or your host) so the webhook and outbound sends work.

---

## 4. Session states and message flow (what’s built)

Session state is stored in **`whatsapp_sessions`** (Supabase) per phone number.

| State                        | Trigger (inbound)                           | What we do (outbound)                                                                                   |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **new**                      | First message from number                   | If referral detected → handle; else send consent (template if via Meta: `tigerhire_consent_v1`).        |
| **awaiting_consent**         | Text reply                                  | YES → welcome + “send CV (PDF)”; NO → opt-out.                                                          |
| **consent_given**            | (re-entry)                                  | Same as new user: welcome + ask for CV.                                                                 |
| **opted_out**                | Any                                         | Only “DELETE MY DATA” erasure; else remind opt-out.                                                     |
| **referral_phone_requested** | Text (phone number)                         | Process referral; then continue flow.                                                                   |
| **cv_requested**             | Document (PDF) → **cv_received** then Scout | “Got your CV. Scoring…” → Scout agent → FitScore results (session message, or template if 24h expired). |
| **cv_requested**             | Non-document                                | “Please send your CV as a PDF file.”                                                                    |
| **scored**                   | Text `1`…`N` (N = TOP_MATCHES_LIMIT)        | Application bridge: create application for chosen role; “interest sent…”                                |
| **scored**                   | Other text                                  | “Reply with the number of the role you want (1 to N)…”                                                  |
| **slot_selection**           | Text `1` / `2` / `3`                        | Scheduler: confirm slot, update pipeline, “Interview confirmed…”                                        |
| **vouch_q1**…**vouch_q5**    | Text                                        | Vouch agent: next question or completion.                                                               |
| **complete** (or unknown)    | Text “MATCHES”                              | “Check your FitScore at …” (app link).                                                                  |
| **complete** / default       | Any other                                   | “Reply MATCHES to see roles, or send a new CV.”                                                         |

So: **one webhook URL**, all inbound messages POSTed there; we route by state and respond with session messages or templates.

---

## 5. Outbound: templates to create (Interakt / Meta)

TigerHire sends **session messages** (free-form text) when inside the 24h window; outside 24h it uses **templates**. Template names must exist and be approved in Interakt (and in Meta if you use Graph API for some).

### 5.1 Interakt (primary outbound – `src/lib/services/whatsapp.ts`)

| Template name                  | When we use it                                          | Body params (order)                      |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| **tigerhire_session_expired**  | 24h window expired and we need to send a reply          | 1: message text (up to 200 chars)        |
| **candidate_match_alert**      | Notify candidate of job matches (if used by a workflow) | candidateName, matchCount, topRole, city |
| **recruiter_shortlist_ready**  | Notify recruiter shortlist is ready (if used)           | roleName, topScore, candidateCount       |
| **candidate_profile_claimed**  | Profile claimed (if used)                               | candidateName                            |
| **candidate_contact_unlocked** | Recruiter unlocked contact (if used)                    | candidateName, companyName               |
| **waitlist_confirmation**      | Waitlist signup                                         | name (or “there”)                        |

Create these in Interakt with the same **names** and **parameter order** (body/header/button as in code). Language we send: **en** (languageCode: `en`).

### 5.2 Meta Graph API (`src/lib/whatsapp/templates.ts`)

Used today for **consent** and **referral** only (ConsentService, EmployeeService):

| Template name             | When we use it   | Body params                       |
| ------------------------- | ---------------- | --------------------------------- |
| **tigerhire_consent_v1**  | New user consent | 1: consent text (variable)        |
| **tigerhire_referral_v1** | Referral invite  | 1: candidateName, 2: referrerName |

Other template names in `templates.ts` (e.g. `tigerhire_fitscore_v1`, `tigerhire_interview_v1`, `tigerhire_reminder_v1`, `tigerhire_employee_invite_v1`) are **not** used by the current handler/scout/orchestrator/scheduler; those flows use **Interakt** session messages (or Interakt templates above). If you later switch those flows to Meta, create and use these names in Meta.

---

## 6. Summary: how to configure “workflows” on WhatsApp

1. **Single webhook**
   - In Interakt (and Meta if applicable): set **Callback URL** = `https://<your-domain>/api/webhooks/whatsapp`.
   - Set **Verify token** = `WHATSAPP_WEBHOOK_SECRET`.
   - Subscribe to **messages**. No need to split by “workflow” for inbound; we route by state.

2. **No extra inbound “workflows”**
   - Don’t create separate Interakt workflows that “handle” the message first. Send **all** inbound messages to the URL above so TigerHire can manage state and 24h window.

3. **Outbound templates**
   - In Interakt: create and approve the templates listed in **§5.1** (same names and params).
   - If you use Meta for consent/referral: create **§5.2** templates in Meta.

4. **Env**
   - Set `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY`; optionally `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` if using Meta for send/media.

5. **Optional automation (e.g. “when job is created, notify candidate”)**
   - Do that either in TigerHire (cron/API) or in Interakt by having a workflow call **TigerHire’s API** (or Interakt’s send API with the same template names). The important part is that **inbound** always goes to our webhook and **templates** match the names/params above.

---

## 7. Code references

| Area                                | File(s)                                  |
| ----------------------------------- | ---------------------------------------- |
| Webhook GET/POST, signature         | `src/app/api/webhooks/whatsapp/route.ts` |
| Inbound routing, state machine      | `src/lib/whatsapp/handler.ts`            |
| Session state types and DB updates  | `src/lib/whatsapp/sessions.ts`           |
| Interakt send (session + templates) | `src/lib/services/whatsapp.ts`           |
| Top matches limit (reply 1–N)       | `src/lib/whatsapp/constants.ts`          |
| Meta templates (consent, referral)  | `src/lib/whatsapp/templates.ts`          |
| Scout → FitScore result (session)   | `src/lib/whatsapp/fitscore-notify.ts`    |
| Apply by number (1–N)               | `src/lib/whatsapp/application-bridge.ts` |
| Slot selection (1/2/3)              | `src/lib/agents/scheduler.ts`            |

**See also:** `docs/WHATSAPP_LEAST_COST_INTEGRATION.md` (cost strategy, integration checklist, session message copy), `docs/WHATSAPP_RESPONSE_TEMPLATES.md` (all template names, params, draft body copy).
