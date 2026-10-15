# TigerHire × WhatsApp — Least-Cost Integration

This doc is the single reference for **integrating TigerHire with WhatsApp** in the **least-cost way**, using existing documentation and code. It covers: integration steps, how cost is minimised, code references, and where response templates/copy live.

---

## 1. Cost strategy (why it’s least cost)

| Channel              | When used                                                                                                                                       | Cost                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Session messages** | Any reply to a candidate who messaged in the **last 24 hours**                                                                                  | **Free** (within WhatsApp’s free service window) |
| **Templates**        | When we need to send a message and the **24h window has expired**, or for **proactive** messages (e.g. match alert, shortlist, referral invite) | Paid per template (utility/marketing rate)       |

TigerHire is built to **maximise session messages** and **minimise templates**:

- All **inbound** messages go to one webhook; TigerHire replies with **session messages** when possible.
- The 24h window is tracked per phone in `whatsapp_sessions.last_candidate_message_at`.
- Only when that window has expired does `sendWhatsAppMessage()` fall back to the **tigerhire_session_expired** template (one template for any “expired” reply).
- Proactive notifications (match alert, shortlist, referral, waitlist) use **one template per message**; we don’t send multiple templates in a row when one will do.

So: **most of the apply flow (consent → CV → FitScore → apply by number) is free**; only re-engagement after 24h or proactive outreach is paid.

---

## 2. Integration steps (summary)

Follow **`docs/WHATSAPP_INTEGRATION_STEP_BY_STEP.md`** for the full checklist. Short version:

1. **Credentials** — Interakt API key (Secret Key from Developer Settings); create a **verify token** (long random string) for the webhook.
2. **Env** — Set `WHATSAPP_WEBHOOK_SECRET` (= verify token), `WHATSAPP_API_KEY` (= Interakt Secret Key). Optional: `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` only if you use **Meta** for consent/referral templates.
3. **Webhook** — In Interakt: Callback URL = `https://<your-domain>/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages**. Do **not** add extra Interakt workflows that handle inbound first; TigerHire is the single handler.
4. **Templates** — Create in Interakt (and Meta if used) the templates listed in **`docs/WHATSAPP_RESPONSE_TEMPLATES.md`** with exact names and parameter order.
5. **Deploy & test** — Deploy with env set, verify webhook, run E2E: new user → consent → CV (PDF) → Scout → reply 1–N → application created.

---

## 3. What’s implemented (code)

| Area                | File(s)                                                          | Notes                                                                                             |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Webhook             | `src/app/api/webhooks/whatsapp/route.ts`                         | GET verify, POST inbound, signature check, rate limit                                             |
| Handler             | `src/lib/whatsapp/handler.ts`                                    | Routes by session state; all states implemented                                                   |
| Sessions            | `src/lib/whatsapp/sessions.ts`                                   | getOrCreateSession, updateSession; `whatsapp_sessions` table                                      |
| 24h window          | `src/lib/repositories/SessionRepository.ts`                      | isWithin24HrWindow; used before sending session vs template                                       |
| Interakt send       | `src/lib/services/whatsapp.ts`                                   | sendWhatsAppMessage (session or tigerhire_session_expired), sendTemplateMessage, notify\* helpers |
| Meta templates      | `src/lib/whatsapp/templates.ts`                                  | sendConsentRequest, sendReferralInvite (consent + referral only)                                  |
| Consent             | `src/lib/agents/consent.ts`, `ConsentService.ts`                 | captureConsentViaWhatsApp, recordConsentResponse                                                  |
| Scout / FitScore    | `src/lib/agents/scout.ts`, `src/lib/whatsapp/fitscore-notify.ts` | CV → scoring → send top matches (session message)                                                 |
| Apply by number     | `src/lib/whatsapp/application-bridge.ts`                         | Reply 1–N → create application                                                                    |
| Slot selection      | `src/lib/agents/scheduler.ts`                                    | Reply 1/2/3 → confirm slot                                                                        |
| Referral (WhatsApp) | `src/lib/whatsapp/referral-handler.ts`                           | “Refer Name — Role — City” → ask phone → message candidate                                        |
| Referral (app)      | `src/lib/services/EmployeeService.ts`                            | POST /api/employees/refer → create session + sendReferralInvite (Meta)                            |

---

## 4. Session message copy (in-code strings)

These are the **session message** strings the app sends (free within 24h). They are hardcoded in the files below; change there to update copy.

| Context                       | Message text                                                                                                                                   | File:location         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Consent not YES/NO            | "Please reply YES to consent to CV processing, or NO to opt out."                                                                              | handler.ts            |
| Opt-out                       | "Understood. Your data will not be processed. You can reach out anytime if you change your mind."                                              | handler.ts            |
| Opt-out reminder              | "You have opted out of TigerHire. Reply 'DELETE MY DATA' to request data erasure."                                                             | handler.ts            |
| Erasure submitted             | "Your data erasure request has been submitted. We will process it within 72 hours."                                                            | handler.ts            |
| CV requested, non-PDF         | "Please send your CV as a PDF file."                                                                                                           | handler.ts            |
| CV received, scoring          | "Got your CV. Scoring now — takes about 2 minutes."                                                                                            | handler.ts            |
| Welcome (new user)            | "Hi! Welcome to TigerHire. Drop your CV (PDF) and get a FitScore against live roles in 2 minutes."                                             | handler.ts            |
| Welcome (referred)            | "Hi! {referrerName} referred you to TigerHire. Drop your CV (PDF) and get a FitScore in 2 minutes."                                            | handler.ts            |
| Scout error                   | "Sorry, we had trouble reading your CV. Please try sending it again as a PDF."                                                                 | handler.ts            |
| Scored: reply hint            | "Reply with the number of the role you want (1 to N), PREFERENCES to set preferences, or send a new CV to get scored again."                   | handler.ts            |
| Scored: preferences link      | "Set job preferences (location, remote, salary) for relevant roles:\n{base}/candidate/profile"                                                 | handler.ts            |
| Scored: MATCHES link          | "Check your matches at {base} — log in with your email."                                                                                       | handler.ts            |
| Complete: MATCHES             | "Check your FitScore matches at {base} — log in or sign up with your email."                                                                   | handler.ts            |
| Complete: PREFERENCES         | "Set your job preferences (location, remote, salary range)…" + profile URL                                                                     | handler.ts            |
| Complete: default             | "Reply MATCHES to see your top roles, PREFERENCES to set job preferences, or send a new CV to get scored again."                               | handler.ts            |
| No session / new CV           | "Send your CV as a PDF to get your FitScore."                                                                                                  | handler.ts            |
| Referrer: not registered      | "Please register on tigerhire.io and add your WhatsApp number to refer candidates."                                                            | referral-handler.ts   |
| Referrer: error               | "Something went wrong. Please try again."                                                                                                      | referral-handler.ts   |
| Referrer: ask candidate phone | "Got it! We'll reach out to {candidateName}. What is {candidateName}'s WhatsApp number?"                                                       | referral-handler.ts   |
| Referrer: invalid referral    | "Referral no longer valid. Please start again."                                                                                                | referral-handler.ts   |
| Referrer: candidate messaged  | "We've sent {candidateName} a message. We'll notify you once they submit their CV."                                                            | referral-handler.ts   |
| Candidate (referred): welcome | "Hi {candidateName}! You were referred to TigerHire by {referrerName}. Drop your CV (PDF) and get a FitScore against live roles in 2 minutes." | referral-handler.ts   |
| Application: no profile       | "We couldn't find your profile. Please send your CV again to get started."                                                                     | application-bridge.ts |
| Application: no matches       | "No matching roles available right now. We'll notify you when new roles come in."                                                              | application-bridge.ts |
| Application: invalid number   | "We only found N match(es). Reply a number from 1 to N."                                                                                       | application-bridge.ts |
| Application: interest sent    | "Interest sent to {company} for {title}. We'll update you when they respond."                                                                  | application-bridge.ts |
| FitScore: no matches          | "Hi {name}! Your profile is live on TigerHire. We'll alert you as matching roles come in. Reply MATCHES anytime to check."                     | fitscore-notify.ts    |
| FitScore: with matches        | Multi-line message with list of roles and "Reply 1 to N to express interest…"                                                                  | fitscore-notify.ts    |

Template-based copy (Interakt/Meta) is in **`docs/WHATSAPP_RESPONSE_TEMPLATES.md`**.

---

## 5. Docs and templates

| Doc                                       | Purpose                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **WHATSAPP_INTEGRATION_STEP_BY_STEP.md**  | Full integration checklist (credentials, webhook, templates, deploy, E2E test).                |
| **WHATSAPP_BUILD_AND_WORKFLOW_CONFIG.md** | What’s built, webhook contract, session states, template list, code refs.                      |
| **WHATSAPP_RESPONSE_TEMPLATES.md**        | All response templates: exact names, parameter order, and draft body copy for Interakt + Meta. |
| **WHATSAPP_SCALABLE_MULTI_ORG_DESIGN.md** | Multi-org, job selection, optional queue/backfill.                                             |
| **INTEGRATION_SYSTEM_CHECK.md**           | How WhatsApp fits with other integrations (email, Stripe, etc.).                               |

---

## 6. Quick checklist

- [ ] Env: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_API_KEY` set; optional Meta vars if using consent/referral via Meta.
- [ ] Interakt: Callback URL = `https://<your-domain>/api/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_SECRET`, subscribe to **messages**; no extra inbound workflows.
- [ ] Interakt templates created and approved (see WHATSAPP_RESPONSE_TEMPLATES.md).
- [ ] Optional: Meta templates for consent/referral if using `templates.ts` for those.
- [ ] E2E: new user → consent → CV → Scout → reply 1–N → application created.
