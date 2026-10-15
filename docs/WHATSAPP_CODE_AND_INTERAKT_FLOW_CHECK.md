# WhatsApp Integration — Code Cross-Check & Interakt Flow

**Short answer: You do NOT build a conversation flow on Interakt (or in Meta’s “Flows” product).** TigerHire is the single handler; Meta/BSP delivers messages to your webhook; routing is **session state in TigerHire**, not Meta Flows UI. Create **approved message templates** where the product sends templates; see [`WHATSAPP_META_FLOWS_CLARIFICATION.md`](./WHATSAPP_META_FLOWS_CLARIFICATION.md) if you expected Meta Flows to be configured.

---

## 1. Code cross-check (all present)

| Piece                         | Location                                      | Status                                                                     |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| **Webhook**                   | `src/app/api/webhooks/whatsapp/route.ts`      | GET (verify), POST (inbound), signature check, rate limit                  |
| **Handler**                   | `src/lib/whatsapp/handler.ts`                 | Routes by session state; all states implemented                            |
| **Sessions**                  | `src/lib/whatsapp/sessions.ts`                | getOrCreateSession, updateSession; state types match                       |
| **DB table**                  | `supabase/schema/16_whatsapp_sessions.sql`    | `whatsapp_sessions` (phone, session_state, context, last_message_at)       |
| **24h window**                | `supabase/schema/35_processing_status.sql`    | `last_candidate_message_at` for template fallback                          |
| **Consent**                   | `src/lib/agents/consent.ts`, `ConsentService` | captureConsentViaWhatsApp, recordConsentResponse (YES/NO)                  |
| **Send (Meta Graph)**         | `src/lib/services/whatsapp.ts`                | sendWhatsAppMessage (session + 24h check), sendTemplateMessage → Graph API |
| **Scout**                     | `src/lib/agents/scout.ts`                     | triggerScoutAgent (CV → FitScore), uses whatsapp_sessions + fit_scores     |
| **Apply by number**           | `src/lib/whatsapp/application-bridge.ts`      | createApplicationFromWhatsApp (1–N → application)                          |
| **FitScore notify**           | `src/lib/whatsapp/fitscore-notify.ts`         | Sends top matches to candidate after Scout                                 |
| **Slot selection**            | `src/lib/agents/scheduler.ts`                 | handleSlotSelection (1/2/3)                                                |
| **Vouch**                     | `src/lib/agents/vouch.ts`                     | handleVouchResponse (vouch_q1…q5)                                          |
| **Referral**                  | `src/lib/whatsapp/referral-handler.ts`        | detectAndHandleReferral, handleReferralCandidatePhone                      |
| **Constants**                 | `src/lib/whatsapp/constants.ts`               | TOP*MATCHES_LIMIT, FITSCORE_MIN*\*                                         |
| **Meta templates** (optional) | `src/lib/whatsapp/templates.ts`               | Consent/referral via Meta Graph API if WHATSAPP_PHONE_NUMBER_ID set        |

All code for the documented flow is in place.

---

## 2. Flow match (handler ↔ docs)

The handler implements exactly the flow in `WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md`:

| State                        | Trigger                       | Code behaviour                                                    |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| **new**                      | First message                 | Referral check; else captureConsentViaWhatsApp                    |
| **awaiting_consent**         | Text                          | recordConsentResponse; YES → welcome + cv_requested, NO → opt-out |
| **consent_given**            | Re-entry                      | handleNewUser (welcome + cv_requested)                            |
| **opted_out**                | Any                           | “DELETE MY DATA” or remind opt-out                                |
| **referral_phone_requested** | Text (phone)                  | handleReferralCandidatePhone                                      |
| **cv_requested**             | Document → cv_received        | handleCVReceived → triggerScoutAgent                              |
| **cv_requested**             | Non-document                  | “Please send your CV as a PDF file.”                              |
| **scored**                   | 1…N                           | createApplicationFromWhatsApp                                     |
| **scored**                   | Other                         | “Reply with the number…” / PREFERENCES / MATCHES                  |
| **slot_selection**           | 1/2/3                         | handleSlotSelection                                               |
| **vouch_q1…q5**              | Text                          | handleVouchResponse                                               |
| **complete** / default       | MATCHES / PREFERENCES / other | handleGeneral (link or “send new CV”)                             |

Flow in code matches the docs.

---

## 3. Do you build a flow on Interakt?

**No.** For this candidate flow you do **not** build a flow/workflow in Interakt.

- **Inbound:** Configure the **product-level webhook** in Interakt so **all** inbound messages go to:
  - `https://<your-domain>/api/webhooks/whatsapp`
- **Routing:** TigerHire does all routing by session state (new → consent → CV → scored → apply → slots/vouch/complete). No Interakt “workflow” should sit in front of this; if it does, TigerHire won’t get the message first and state will break.
- **Outbound:** TigerHire calls the **Meta Cloud API** to send session messages and templates (see `src/lib/services/whatsapp.ts`). You need **approved templates** in WhatsApp Manager with names/params matching the code — not a Meta “Flows” configuration for the default candidate path.

**What you configure in Meta / BSP (not “Flows”):**

1. **Webhook:** Set URL + verify token (already done).
2. **Templates:** In **WhatsApp Manager → Message templates**, create templates with exact names and parameter order (see `WHATSAPP_INTEGRATION_STEP_BY_STEP.md`, `WHATSAPP_RESPONSE_TEMPLATES.md`, or `WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md` §5.1).
3. **No conversation Flow / workflow in front of inbound:** Do not create an Interakt “workflow” or Meta **Flows** UI that handles the chat before your webhook; the single webhook + TigerHire session state is the product flow.

Optional: later you can add BSP workflows that _trigger_ on external events and call your APIs to send messages; the important part is that **inbound** always goes to the single webhook above.

---

## 4. Payload shape (Meta/Interakt)

The handler expects a **Meta-style** payload:

- `payload.messages[]` — at least one message
- `message.from` — phone
- `message.type` — `text` | `document` | `image`
- `message.text?.body` — for text
- `message.document?.id` — for document (CV)

Docs describe this as “Meta/Interakt style”. If Interakt forwards WhatsApp events in this shape (or the same as Meta’s webhook), no change is needed. If you get 200 but no reply, check the incoming POST body; if it uses different keys (e.g. `data.customer`, `data.message`), we’d add a small adapter in the webhook route to map to this shape before calling `handleInboundMessage`.

---

## 5. Quick checklist

- [x] Webhook route (GET + POST) and handler implemented
- [x] All session states and transitions implemented
- [x] Sessions table and 24h column exist
- [x] Consent, Scout, application-bridge, scheduler, vouch, referral wired
- [x] Interakt send (session + templates) and template names documented
- [ ] **You:** Webhook URL + secret configured in Interakt (done)
- [ ] **You:** Create 6 Interakt templates (names + params), get approved
- [ ] **You:** Deploy with env set; verify webhook; run E2E test
- [ ] **You:** Do **not** create an Interakt flow for this conversation — single webhook only

No further flow build is required on Interakt for this integration.
