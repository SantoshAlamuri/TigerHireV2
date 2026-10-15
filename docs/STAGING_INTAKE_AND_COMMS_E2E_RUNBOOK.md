# Staging E2E runbook: intake, WhatsApp, and email

Run this on **staging** (or a dedicated preview) with intentional outbound configuration. Record pass/fail in the log template at the end.

## Preconditions

1. **Supabase** staging project linked; migrations applied (including `idempotency_keys` if webhook dedupe is under test).
2. **Secrets** aligned with [`INTAKE_CHANNELS_ACCEPTANCE_MATRIX.md`](./INTAKE_CHANNELS_ACCEPTANCE_MATRIX.md):
   - `EMAIL_INTAKE_SECRET` + working path to `POST /api/intake/email`
   - `WHATSAPP_META_APP_SECRET` (or equivalent) for webhook HMAC; `WHATSAPP_WEBHOOK_SECRET` for GET subscription verify
   - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` for outbound sends
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
3. **Outbound policy:** On preview/local, real sends are often suppressed by `WHATSAPP_MODE=sandbox` / `EMAIL_MODE` or equivalent — set staging explicitly so test traffic is **expected** to deliver (or document sandbox-only success as “logged not sent”).
4. **Interakt / Meta:** Webhook URL points to `https://<staging-host>/api/webhooks/whatsapp` with verify token matching `WHATSAPP_WEBHOOK_SECRET` (see [`WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md`](./WHATSAPP_CODE_AND_INTERAKT_FLOW_CHECK.md)).

---

## Part A — Email intake

| Step | Action                                                                                                                                         | Expected                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A1   | Create or pick an open job; copy `jobs+<jobId>@in.tigerhire.com` from the product (or build from job UUID).                                    | Address matches regex in intake route.                    |
| A2   | POST or relay email with PDF attachment per intake contract (see [`src/app/api/intake/email/route.ts`](../src/app/api/intake/email/route.ts)). | `201`, body includes `candidateId` and `jobId`.           |
| A3   | In app, locate candidate under org/job.                                                                                                        | Row visible; FitScore path consistent with other intakes. |

---

## Part B — Public web apply (form)

| Step | Action                                                                                           | Expected                                                                   |
| ---- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| B1   | Open `/apply/<orgSlug>?job=<jobId>` in a clean browser session.                                  | Job list or preselected job loads.                                         |
| B2   | Upload a small valid PDF, fill optional fields, submit.                                          | Success UI; API outcome `scored` or honest `processing` / `manual_review`. |
| B3   | Confirm duplicate idempotency (optional): repeat same `Idempotency-Key` if testing API directly. | Same response, no double candidate.                                        |

---

## Part C — WhatsApp inbound and apply

| Step | Action                                                                                              | Expected                                                                 |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C1   | Send first message from test handset to production WhatsApp Business number (or sandbox per setup). | `200` from webhook; session state `new` / consent flow started.          |
| C2   | Complete consent (YES path per templates).                                                          | Session `awaiting_consent` → next state per handler.                     |
| C3   | Send PDF document as CV.                                                                            | Parsing/scoring triggered; candidate receives role list when applicable. |
| C4   | Reply with valid job index.                                                                         | Application created; recruiter sees candidate on job.                    |
| C5   | `GET /api/whatsapp/flow-status?jobId=...&candidateId=...` as authorised recruiter.                  | JSON timeline includes expected milestones when data exists.             |

**Duplicate delivery:** Send same inbound `wamid` twice (replay); second request should hit idempotency layer without double-processing when DB idempotency is available.

---

## Part D — Outbound WhatsApp and email

| Step | Action                                                                                  | Expected                                                                                |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1   | Trigger any template or session message from a flow step (e.g. post-consent).           | Meta API success or documented sandbox log line.                                        |
| D2   | Trigger orchestrator outreach or a simple `sendEmail` path with a test inbox.           | Resend dashboard shows message; headers include correlation id when configured.         |
| D3   | Offer send (if in scope): candidate must have email on file per offer route validation. | `400` without email teaches data prerequisite; with email, message sent or hold logged. |

---

## Part E — Job board → apply URL

| Step | Action                                                         | Expected                                                                              |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E1   | Configure Adzuna and/or Indeed credentials for a **test** org. | Settings save without error.                                                          |
| E2   | Publish/distribute an open job.                                | `job_distributions` shows `pushed` or actionable `failed` with error text.            |
| E3   | Open listing’s apply URL in browser.                           | Lands on `tigerhire.io/apply/...` (or configured host) with `job` query when present. |
| E4   | Submit one application through that URL.                       | Same persistence checks as Part B.                                                    |

---

## Pass/fail log (copy per run)

| Part | Step  | Pass/Fail | Evidence (link / screenshot) | Notes |
| ---- | ----- | --------- | ---------------------------- | ----- |
| A    | A1–A3 |           |                              |       |
| B    | B1–B3 |           |                              |       |
| C    | C1–C5 |           |                              |       |
| D    | D1–D3 |           |                              |       |
| E    | E1–E4 |           |                              |       |

**Run metadata:** environment URL, date, operator, build SHA / deployment id.
